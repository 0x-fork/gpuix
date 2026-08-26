//! Highlight ranges painted behind text: search matches and explicit ranges.
//!
//! There is deliberately no joined "document" for the `query` case. React makes
//! a separate host node for every interpolated string, so `<text>Hello {name}!`
//! is three painted runs of ONE logical line. Those runs are merged into a
//! [`Group`]; a match never crosses a group. Chrome's find behaves the same way
//! across a paragraph boundary, and it means a 5k-row list is 5k small strings
//! instead of one megabyte string that must be rebuilt on every keystroke.
//!
//! Grouping is structural (same parent host element, adjacent children). It never
//! reads `display`, which only knows `flex` and `grid` here anyway.

use std::cell::RefCell;
use std::collections::HashMap;
use std::ops::Range;
use std::sync::Arc;

use gpui::Hsla;

use crate::retained_tree::RetainedTree;

// ── Spec ─────────────────────────────────────────────────────────────

/// One `highlight` entry as it arrives from JS, with colours already resolved
/// against the theme.
#[derive(Clone, Debug, PartialEq)]
pub struct HighlightSpec {
    pub query: String,
    pub case_sensitive: bool,
    pub whole_word: bool,
    /// `[start, end)` in UTF-16 code units, indexing the declaring subtree's
    /// joined text. Empty unless the caller supplied explicit ranges.
    pub ranges: Vec<(usize, usize)>,
    pub color: Hsla,
    pub active_color: Hsla,
    pub active_index: Option<usize>,
    pub radius: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct HighlightSet {
    pub specs: Vec<HighlightSpec>,
}

impl HighlightSet {
    /// Parse the raw custom prop. `null`, a bad shape, or an all-empty set
    /// yields `None`, so nothing resolves and nothing paints.
    pub fn parse(value: &serde_json::Value, theme: &crate::theme::Theme) -> Option<Self> {
        let items = match value {
            serde_json::Value::Array(items) => items.as_slice(),
            serde_json::Value::Object(_) => std::slice::from_ref(value),
            _ => return None,
        };
        let specs: Vec<HighlightSpec> = items
            .iter()
            .filter_map(|item| HighlightSpec::parse(item, theme))
            .collect();
        (!specs.is_empty()).then_some(Self { specs })
    }

    /// Key for the match cache. Deliberately excludes `active_index`, `color`
    /// and `active_color`: moving a find-bar cursor must not rescan any text.
    pub fn matcher_hash(&self) -> u64 {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        for spec in &self.specs {
            spec.query.hash(&mut hasher);
            spec.case_sensitive.hash(&mut hasher);
            spec.whole_word.hash(&mut hasher);
            spec.ranges.hash(&mut hasher);
        }
        hasher.finish()
    }

    /// True when any spec supplies explicit ranges. Only then is the joined
    /// document built, because only then does anyone index into it.
    pub fn needs_document(&self) -> bool {
        self.specs.iter().any(|spec| !spec.ranges.is_empty())
    }
}

impl HighlightSpec {
    fn parse(value: &serde_json::Value, theme: &crate::theme::Theme) -> Option<Self> {
        let object = value.as_object()?;
        let string = |key: &str| object.get(key).and_then(serde_json::Value::as_str);
        let flag = |key: &str| {
            object
                .get(key)
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false)
        };
        let color = |key: &str| string(key).and_then(crate::color::parse_color_rgba);

        let query = string("query").unwrap_or_default().to_string();
        let ranges = object
            .get("ranges")
            .and_then(serde_json::Value::as_array)
            .map(|pairs| {
                pairs
                    .iter()
                    .filter_map(|pair| {
                        let pair = pair.as_array()?;
                        let start = pair.first()?.as_u64()? as usize;
                        let end = pair.get(1)?.as_u64()? as usize;
                        (start < end).then_some((start, end))
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if query.is_empty() && ranges.is_empty() {
            return None;
        }

        let mut base = theme.accent;
        base.a = 0.30;
        let mut active = theme.accent;
        active.a = 0.65;
        Some(Self {
            query,
            case_sensitive: flag("caseSensitive"),
            whole_word: flag("wholeWord"),
            ranges,
            color: color("color").map(Into::into).unwrap_or(base),
            active_color: color("activeColor").map(Into::into).unwrap_or(active),
            active_index: object
                .get("activeIndex")
                .and_then(serde_json::Value::as_u64)
                .map(|n| n as usize),
            radius: object
                .get("radius")
                .and_then(serde_json::Value::as_f64)
                .map(|n| n as f32)
                .unwrap_or(2.0),
        })
    }
}

// ── Lowercasing ──────────────────────────────────────────────────────
//
// This is Unicode default lowercasing (`str::to_lowercase`), NOT full case
// folding. `ﬀ` does not match `ff`, and `İ` lowercases to `i` plus a combining
// dot. `findRanges` in `packages/react/src/hooks/use-text-search.ts` uses
// JS `toLowerCase`, which follows the same Unicode rules.

/// Lowercase `text` and record, for every folded byte, the byte offset of the
/// original character that produced it.
///
/// Lowercasing alone is not enough: Unicode case conversion changes byte length
/// (`İ` is 2 bytes and folds to 3), so a match offset in folded space does not
/// index the original. The map converts it back exactly.
fn fold(text: &str) -> (String, Vec<u32>) {
    let mut folded = String::with_capacity(text.len());
    let mut map: Vec<u32> = Vec::with_capacity(text.len() + 1);
    for (ix, ch) in text.char_indices() {
        for lower in ch.to_lowercase() {
            let len = lower.len_utf8();
            folded.push(lower);
            for _ in 0..len {
                map.push(ix as u32);
            }
        }
    }
    map.push(text.len() as u32);
    (folded, map)
}

// ── Offsets ──────────────────────────────────────────────────────────

/// UTF-16 code-unit range to a UTF-8 byte range.
///
/// JS gives UTF-16 indices, which is what `indexOf` and `RegExp.exec` return.
/// A boundary that falls inside a surrogate pair has no character boundary here,
/// so it is rejected rather than snapped: silently moving a caller's range is
/// worse than telling them it was wrong.
fn utf16_range_to_bytes(text: &str, start: usize, end: usize) -> Option<Range<usize>> {
    if start >= end {
        return None;
    }
    let (mut byte_start, mut byte_end) = (None, None);
    let mut units = 0usize;
    for (ix, ch) in text.char_indices() {
        if units == start {
            byte_start = Some(ix);
        }
        if units == end {
            byte_end = Some(ix);
        }
        units += ch.len_utf16();
    }
    if units == start {
        byte_start = Some(text.len());
    }
    if units == end {
        byte_end = Some(text.len());
    }
    match (byte_start, byte_end) {
        (Some(s), Some(e)) if s < e => Some(s..e),
        _ => None,
    }
}

fn is_word_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_'
}

fn is_whole_word(text: &str, range: &Range<usize>) -> bool {
    let before = text[..range.start].chars().next_back();
    let after = text[range.end..].chars().next();
    !before.is_some_and(is_word_char) && !after.is_some_and(is_word_char)
}

/// A declaration as a native element sees it: the spec, plus how many retained
/// matches each spec already numbered.
///
/// Without the offsets a native run would restart at 0, so `activeIndex: 1`
/// would mark the second match of *every* code line active instead of one.
#[derive(Debug)]
pub struct NativeHighlight {
    pub set: Arc<HighlightSet>,
    /// Retained match count per spec, the first ordinal a native run may use.
    pub offsets: Vec<usize>,
}

/// Per-frame native match numbering.
#[derive(Default)]
struct NativeOrdinals {
    /// Next ordinal per `(declaration, spec)`.
    cursor: HashMap<(usize, usize), usize>,
    /// Ordinals already handed to a run, so a row gpui paints twice keeps the
    /// numbers it had the first time instead of advancing the cursor again.
    assigned: HashMap<(usize, usize, Arc<str>), usize>,
}

thread_local! {
    static NATIVE: RefCell<NativeOrdinals> = RefCell::new(NativeOrdinals::default());
}

/// Clear the per-frame native match numbering. Called by the frame reset.
pub fn native_frame_reset() {
    NATIVE.with(|state| *state.borrow_mut() = NativeOrdinals::default());
}

fn native_start(
    declaration: usize,
    spec: usize,
    key: &Arc<str>,
    count: usize,
    offset: usize,
) -> usize {
    NATIVE.with(|state| {
        let state = &mut *state.borrow_mut();
        let slot = (declaration, spec, key.clone());
        if let Some(start) = state.assigned.get(&slot) {
            return *start;
        }
        let next = state.cursor.entry((declaration, spec)).or_insert(offset);
        let start = *next;
        *next += count;
        state.assigned.insert(slot, start);
        start
    })
}

/// Washes for a string a native element is about to paint.
///
/// `<code>`, `<markdown>` and `<diff>` build their text inside `render()`, so it
/// never reaches the retained tree and [`GroupList::collect`] cannot see it.
/// They match the exact string they are painting instead, which makes drift
/// between the search pass and the paint pass impossible.
///
/// Explicit `ranges` are skipped here: they index the retained subtree's joined
/// document, which a natively generated string is not part of.
pub fn washes_for_native_run(key: &Arc<str>, text: &str, native: &NativeHighlight) -> Vec<Wash> {
    let mut out = Vec::new();
    // Folding allocates, and a case-sensitive spec never reads it.
    let folded = native
        .set
        .specs
        .iter()
        .any(|spec| !spec.case_sensitive && !spec.query.is_empty())
        .then(|| fold(text));
    let (folded, fold_map) = match &folded {
        Some((folded, map)) => (folded.as_str(), map.as_slice()),
        None => ("", [].as_slice()),
    };

    let declaration = Arc::as_ptr(&native.set) as *const u8 as usize;
    for (spec_index, spec) in native.set.specs.iter().enumerate() {
        let hits = matches_in(text, folded, fold_map, spec);
        if hits.is_empty() {
            continue;
        }
        let offset = native.offsets.get(spec_index).copied().unwrap_or(0);
        let start = native_start(declaration, spec_index, key, hits.len(), offset);
        for (position, range) in hits.into_iter().enumerate() {
            let active = spec.active_index == Some(start + position);
            out.push(Wash {
                range,
                color: if active { spec.active_color } else { spec.color },
                radius: spec.radius,
                active,
            });
        }
    }
    out
}

/// Non-overlapping byte ranges of `spec.query` in `text`, leftmost first.
///
/// `folded` and `fold_map` come from [`fold`] and are cached with the group, so
/// a keystroke never re-folds text that did not change.
fn matches_in(
    text: &str,
    folded: &str,
    fold_map: &[u32],
    spec: &HighlightSpec,
) -> Vec<Range<usize>> {
    if spec.query.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::new();
    if spec.case_sensitive {
        for (ix, hit) in text.match_indices(spec.query.as_str()) {
            let range = ix..ix + hit.len();
            if !spec.whole_word || is_whole_word(text, &range) {
                out.push(range);
            }
        }
        return out;
    }
    let needle = spec.query.to_lowercase();
    for (ix, hit) in folded.match_indices(needle.as_str()) {
        let (Some(&start), Some(&end)) = (fold_map.get(ix), fold_map.get(ix + hit.len())) else {
            continue;
        };
        let range = start as usize..end as usize;
        if range.start >= range.end {
            continue;
        }
        if !spec.whole_word || is_whole_word(text, &range) {
            out.push(range);
        }
    }
    out
}

// ── Groups ───────────────────────────────────────────────────────────

/// Consecutive primitive text children of one host element, merged into the
/// single logical line the author wrote.
#[derive(Debug)]
pub struct Group {
    /// Selection key of each painted run, with its byte range inside `text`.
    pub parts: Vec<(Arc<str>, Range<usize>)>,
    pub text: String,
    folded: String,
    fold_map: Vec<u32>,
}

impl Group {
    fn new(parts: Vec<(Arc<str>, Range<usize>)>, text: String) -> Self {
        let (folded, fold_map) = fold(&text);
        Self {
            parts,
            text,
            folded,
            fold_map,
        }
    }
}

#[derive(Debug, Default)]
pub struct GroupList {
    groups: Vec<Group>,
}

impl GroupList {
    /// Collect the groups of `id`'s subtree, skipping any descendant that
    /// declares its own `highlight`: the nearest declaration wins, so an
    /// ancestor must not resolve or count matches that will never paint.
    pub fn collect(tree: &RetainedTree, id: u64) -> Self {
        let mut groups = Vec::new();
        collect_into(tree, id, true, &mut groups);
        Self { groups }
    }

    /// The joined text, groups separated by a newline, plus each group's start
    /// offset. Built only when a spec supplies explicit `ranges`.
    fn document(&self) -> (String, Vec<usize>) {
        let mut text = String::new();
        let mut starts = Vec::with_capacity(self.groups.len());
        for group in &self.groups {
            if !text.is_empty() {
                text.push('\n');
            }
            starts.push(text.len());
            text.push_str(&group.text);
        }
        (text, starts)
    }
}

/// True for a primitive text node, the kind React makes for a raw string.
///
/// Shape only: an empty one is transparent rather than a run boundary, so
/// `{'a'}{''}{'b'}` stays one line. Copy uses the same predicate through
/// [`group_id`], which is the only way the two can agree.
pub fn is_text_leaf(element: &crate::retained_tree::RetainedElement) -> bool {
    element.element_type == "text"
        && element.children.is_empty()
        && !element.custom_props.contains_key("highlight")
}

/// Id of the first run of the adjacent primitive-text run `id` belongs to, or
/// `None` for a run that never merges with a neighbour.
///
/// This is the group identity the selection registry stores. It must stay in
/// step with [`collect_into`]: `element.parent` alone is not enough, because a
/// non-text sibling between two text leaves ends the run for search but would
/// not end it for copy.
pub fn group_id(tree: &RetainedTree, id: u64) -> Option<u64> {
    let element = tree.elements.get(&id)?;
    if !is_text_leaf(element) {
        return None;
    }
    let parent = tree.elements.get(&element.parent?)?;
    let position = parent.children.iter().position(|child| *child == id)?;
    let mut first = id;
    for &sibling in parent.children[..position].iter().rev() {
        match tree.elements.get(&sibling) {
            Some(sibling_element) if is_text_leaf(sibling_element) => first = sibling,
            _ => break,
        }
    }
    Some(first)
}

fn collect_into(tree: &RetainedTree, id: u64, is_root: bool, out: &mut Vec<Group>) {
    let Some(element) = tree.elements.get(&id) else {
        return;
    };
    if !is_root && element.custom_props.contains_key("highlight") {
        return;
    }
    // Own content is a line of its own. For a leaf this only happens when the
    // declaration sits directly on a text node, which the mutation API allows
    // even though JSX always wraps.
    if let Some(content) = element.content.as_ref().filter(|text| !text.is_empty()) {
        out.push(Group::new(
            vec![(crate::text::selection_key(id, 0), 0..content.len())],
            content.clone(),
        ));
    }

    let mut pending: Vec<(Arc<str>, Range<usize>)> = Vec::new();
    let mut pending_text = String::new();
    for &child_id in &element.children {
        let Some(child) = tree.elements.get(&child_id) else {
            continue;
        };
        if !is_text_leaf(child) {
            flush(&mut pending, &mut pending_text, out);
            collect_into(tree, child_id, false, out);
            continue;
        }
        let Some(content) = child.content.as_ref().filter(|text| !text.is_empty()) else {
            continue;
        };
        let start = pending_text.len();
        pending_text.push_str(content);
        pending.push((
            crate::text::selection_key(child_id, 0),
            start..pending_text.len(),
        ));
    }
    flush(&mut pending, &mut pending_text, out);
}

fn flush(
    parts: &mut Vec<(Arc<str>, Range<usize>)>,
    text: &mut String,
    out: &mut Vec<Group>,
) {
    if parts.is_empty() {
        return;
    }
    out.push(Group::new(std::mem::take(parts), std::mem::take(text)));
}

// ── Resolution ───────────────────────────────────────────────────────

/// Where one match landed inside one painted run.
///
/// Colour-free on purpose: this is what the matcher-hash cache stores, so a
/// colour or `activeIndex` change never scans any text again.
#[derive(Clone, Debug)]
struct MatchRef {
    range: Range<usize>,
    spec: usize,
    /// Ordinal of the match within its spec, in document order. Stable across
    /// runs, so a match split over several runs is still one match.
    index: usize,
}

/// Every match of one subtree, keyed by the run that must paint it.
#[derive(Debug, Default)]
pub struct MatchSet {
    by_key: HashMap<Arc<str>, Vec<MatchRef>>,
    /// Matches found, counted once even when split across runs. Reported to JS.
    pub total: usize,
    /// Per-spec counts, so a native run can continue the same numbering rather
    /// than restarting at 0. See [`NativeHighlight`].
    pub per_spec: Vec<usize>,
}

impl MatchSet {
    /// Identity for the `onHighlight` guard. The count alone is not enough:
    /// swapping one query for another with the same count is a new result.
    /// Colours and `activeIndex` are excluded, so a find-cursor move is not.
    pub fn identity(&self) -> u64 {
        use std::hash::{Hash, Hasher};
        let mut keys: Vec<&Arc<str>> = self.by_key.keys().collect();
        keys.sort();
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        self.total.hash(&mut hasher);
        for key in keys {
            key.hash(&mut hasher);
            for entry in &self.by_key[key] {
                entry.range.hash(&mut hasher);
                entry.spec.hash(&mut hasher);
                entry.index.hash(&mut hasher);
            }
        }
        hasher.finish()
    }
}

/// One painted wash: a byte range of one run, with its colour.
#[derive(Clone, Debug)]
pub struct Wash {
    pub range: Range<usize>,
    pub color: Hsla,
    pub radius: f32,
    pub active: bool,
}

/// Every wash of one subtree, keyed by the run that must paint it.
#[derive(Debug, Default)]
pub struct ResolvedHighlights {
    by_key: HashMap<Arc<str>, Vec<Wash>>,
}

impl ResolvedHighlights {
    pub fn washes_for(&self, key: &str) -> Option<&[Wash]> {
        self.by_key.get(key).map(Vec::as_slice)
    }
}

/// Apply colours to already-located matches. O(matches), no text scanned.
pub fn colorize(matches: &MatchSet, set: &HighlightSet) -> ResolvedHighlights {
    let mut out = ResolvedHighlights {
        by_key: HashMap::with_capacity(matches.by_key.len()),
    };
    for (key, entries) in &matches.by_key {
        let washes = entries
            .iter()
            .filter_map(|entry| {
                let spec = set.specs.get(entry.spec)?;
                let active = spec.active_index == Some(entry.index);
                Some(Wash {
                    range: entry.range.clone(),
                    color: if active { spec.active_color } else { spec.color },
                    radius: spec.radius,
                    active,
                })
            })
            .collect();
        out.by_key.insert(key.clone(), washes);
    }
    out
}

/// Locate every match of a subtree's groups. Colour-free.
pub fn resolve(groups: &GroupList, set: &HighlightSet) -> MatchSet {
    let mut matches = MatchSet::default();
    let document = set.needs_document().then(|| groups.document());

    for (spec_index, spec) in set.specs.iter().enumerate() {
        let mut index = 0usize;
        if !spec.query.is_empty() {
            for group in &groups.groups {
                for range in matches_in(&group.text, &group.folded, &group.fold_map, spec) {
                    push_match(&mut matches, group, &range, spec_index, index);
                    index += 1;
                }
            }
        }
        if let Some((text, starts)) = document.as_ref() {
            for &(start, end) in &spec.ranges {
                let Some(doc_range) = utf16_range_to_bytes(text, start, end) else {
                    log::warn!("highlight range [{start}, {end}) is not a valid UTF-16 range");
                    continue;
                };
                for (group, &group_start) in groups.groups.iter().zip(starts) {
                    // Groups sit at `start..start + len` with a separating
                    // newline that belongs to no group, so a range covering a
                    // separator simply contributes nothing there.
                    let group_end = group_start + group.text.len();
                    if doc_range.end <= group_start || doc_range.start >= group_end {
                        continue;
                    }
                    let local =
                        (doc_range.start.max(group_start) - group_start)
                            ..(doc_range.end.min(group_end) - group_start);
                    if local.start < local.end {
                        push_match(&mut matches, group, &local, spec_index, index);
                    }
                }
                index += 1;
            }
        }
        matches.per_spec.push(index);
        matches.total += index;
    }
    matches
}

/// Split one group-level range across the runs that actually painted it.
fn push_match(
    matches: &mut MatchSet,
    group: &Group,
    range: &Range<usize>,
    spec: usize,
    index: usize,
) {
    for (key, part) in &group.parts {
        let lo = range.start.max(part.start);
        let hi = range.end.min(part.end);
        if lo >= hi {
            continue;
        }
        matches.by_key.entry(key.clone()).or_default().push(MatchRef {
            range: (lo - part.start)..(hi - part.start),
            spec,
            index,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(query: &str) -> HighlightSpec {
        HighlightSpec {
            query: query.to_string(),
            case_sensitive: false,
            whole_word: false,
            ranges: Vec::new(),
            color: gpui::rgba(0xff000080).into(),
            active_color: gpui::rgba(0x00ff0080).into(),
            active_index: None,
            radius: 2.0,
        }
    }

    fn find(text: &str, spec: &HighlightSpec) -> Vec<Range<usize>> {
        let (folded, map) = fold(text);
        matches_in(text, &folded, &map, spec)
    }

    /// Locate, then colour. Tests assert on the painted washes and the count.
    fn washes(groups: &GroupList, set: &HighlightSet) -> (ResolvedHighlights, usize) {
        let matches = resolve(groups, set);
        let total = matches.total;
        (colorize(&matches, set), total)
    }

    #[test]
    fn case_insensitive_by_default() {
        assert_eq!(find("Foo foo FOO", &spec("foo")), vec![0..3, 4..7, 8..11]);
    }

    #[test]
    fn case_sensitive_when_asked() {
        let mut s = spec("foo");
        s.case_sensitive = true;
        assert_eq!(find("Foo foo FOO", &s), vec![4..7]);
    }

    #[test]
    fn whole_word_rejects_substrings() {
        let mut s = spec("foo");
        s.whole_word = true;
        assert_eq!(find("foo food _foo foo!", &s), vec![0..3, 14..17]);
    }

    #[test]
    fn empty_query_finds_nothing() {
        assert_eq!(find("anything", &spec("")), Vec::<Range<usize>>::new());
    }

    #[test]
    fn matches_are_not_overlapping() {
        assert_eq!(find("aaaa", &spec("aa")), vec![0..2, 2..4]);
    }

    /// Folding changes byte length, so the offset map is the only thing that
    /// keeps a case-insensitive hit indexing the original string.
    ///
    /// `ẞ` is 3 bytes and folds to `ß`, which is 2. A naive lowercase-both
    /// approach reports a range that is short by one byte per occurrence.
    #[test]
    fn folding_keeps_offsets_in_the_original() {
        let text = "auf der STRAẞE hier";
        let hits = find(text, &spec("straße"));
        assert_eq!(hits.len(), 1);
        assert_eq!(&text[hits[0].clone()], "STRAẞE");
    }

    /// Documented Unicode edge: `İ` lowercases to `i` plus a combining dot, so
    /// a plain `istanbul` query does not match `İstanbul`. Matching the dotted
    /// form works. This is `str::to_lowercase` behaviour, not a bug here, and
    /// the offset map still keeps the reported range on a character boundary.
    #[test]
    fn dotted_capital_i_folds_to_two_characters() {
        let text = "İstanbul";
        assert!(find(text, &spec("istanbul")).is_empty());
        let hits = find(text, &spec("i\u{307}stanbul"));
        assert_eq!(hits.len(), 1);
        assert_eq!(&text[hits[0].clone()], "İstanbul");
    }

    #[test]
    fn matches_containing_an_emoji() {
        let text = "hi 👋 there";
        let hits = find(text, &spec("👋 there"));
        assert_eq!(hits.len(), 1);
        assert_eq!(&text[hits[0].clone()], "👋 there");
    }

    #[test]
    fn utf16_offsets_map_to_bytes() {
        assert_eq!(utf16_range_to_bytes("hello", 1, 3), Some(1..3));
        // "é" is 1 UTF-16 unit and 2 UTF-8 bytes.
        assert_eq!(utf16_range_to_bytes("héllo", 1, 3), Some(1..4));
        // "👋" is 2 UTF-16 units and 4 UTF-8 bytes.
        assert_eq!(utf16_range_to_bytes("a👋b", 1, 3), Some(1..5));
    }

    #[test]
    fn utf16_rejects_a_split_surrogate_pair() {
        assert_eq!(utf16_range_to_bytes("a👋b", 1, 2), None);
        assert_eq!(utf16_range_to_bytes("a👋b", 2, 4), None);
    }

    #[test]
    fn utf16_rejects_reversed_and_out_of_range() {
        assert_eq!(utf16_range_to_bytes("hello", 3, 1), None);
        assert_eq!(utf16_range_to_bytes("hello", 0, 0), None);
        assert_eq!(utf16_range_to_bytes("hello", 2, 99), None);
    }

    // ── Grouping ─────────────────────────────────────────────────────

    /// `<div><text>Hello {name}!</text></div>` — React splits one line into
    /// three host nodes that must search as one string.
    fn interpolated_tree() -> RetainedTree {
        let mut tree = RetainedTree::new();
        tree.create_element(1, "div".to_string());
        tree.create_element(2, "text".to_string());
        tree.append_child(1, 2);
        for (id, text) in [(3, "Hello "), (4, "Tommy"), (5, "!")] {
            tree.create_element(id, "text".to_string());
            tree.append_child(2, id);
            tree.set_text(id, text.to_string());
        }
        tree
    }

    #[test]
    fn interpolated_children_form_one_group() {
        let groups = GroupList::collect(&interpolated_tree(), 1);
        assert_eq!(groups.groups.len(), 1);
        assert_eq!(groups.groups[0].text, "Hello Tommy!");
        assert_eq!(groups.groups[0].parts.len(), 3);
    }

    #[test]
    fn a_match_across_runs_splits_into_per_run_washes() {
        let groups = GroupList::collect(&interpolated_tree(), 1);
        let set = HighlightSet {
            specs: vec![spec("Hello Tommy")],
        };
        let (resolved, total) = washes(&groups, &set);
        assert_eq!(total, 1);
        assert_eq!(resolved.washes_for("3:0").unwrap()[0].range, 0..6);
        assert_eq!(resolved.washes_for("4:0").unwrap()[0].range, 0..5);
        assert!(resolved.washes_for("5:0").is_none());
    }

    #[test]
    fn separate_parents_are_separate_groups() {
        let mut tree = RetainedTree::new();
        tree.create_element(1, "div".to_string());
        for (wrapper, leaf, text) in [(2, 3, "quick "), (4, 5, "brown")] {
            tree.create_element(wrapper, "text".to_string());
            tree.append_child(1, wrapper);
            tree.create_element(leaf, "text".to_string());
            tree.append_child(wrapper, leaf);
            tree.set_text(leaf, text.to_string());
        }
        let groups = GroupList::collect(&tree, 1);
        assert_eq!(groups.groups.len(), 2);
        // A match must not cross the line boundary, exactly like browser find.
        let set = HighlightSet {
            specs: vec![spec("quick brown")],
        };
        assert_eq!(resolve(&groups, &set).total, 0);
    }

    #[test]
    fn a_nested_declaration_is_skipped_by_the_ancestor() {
        let mut tree = interpolated_tree();
        tree.set_custom_prop(2, "highlight".to_string(), serde_json::json!({"query": "x"}));
        let groups = GroupList::collect(&tree, 1);
        assert!(groups.groups.is_empty(), "nearest declaration must win");
        // The nested element still resolves its own subtree.
        assert_eq!(GroupList::collect(&tree, 2).groups.len(), 1);
    }

    #[test]
    fn explicit_ranges_index_the_joined_document() {
        let groups = GroupList::collect(&interpolated_tree(), 1);
        let mut s = spec("");
        s.query = String::new();
        s.ranges = vec![(6, 11)];
        let (resolved, total) = washes(&groups, &HighlightSet { specs: vec![s] });
        assert_eq!(total, 1);
        assert_eq!(resolved.washes_for("4:0").unwrap()[0].range, 0..5);
    }

    #[test]
    fn active_index_recolours_exactly_one_match() {
        let groups = GroupList::collect(&interpolated_tree(), 1);
        let mut s = spec("l");
        s.active_index = Some(1);
        let (resolved, total) = washes(&groups, &HighlightSet { specs: vec![s] });
        assert_eq!(total, 2);
        let washes = resolved.washes_for("3:0").unwrap();
        assert_eq!(washes.len(), 2);
        assert!(!washes[0].active);
        assert!(washes[1].active);
    }

    /// A non-text sibling ends the run for search, so it must end it for copy
    /// too. `group_id` is the shared answer.
    #[test]
    fn a_non_text_sibling_ends_the_group_for_both() {
        let mut tree = RetainedTree::new();
        tree.create_element(1, "text".to_string());
        for (id, kind) in [(2, "text"), (3, "div"), (4, "text")] {
            tree.create_element(id, kind.to_string());
            tree.append_child(1, id);
        }
        tree.set_text(2, "A".to_string());
        tree.set_text(4, "C".to_string());

        let groups = GroupList::collect(&tree, 1);
        assert_eq!(groups.groups.len(), 2);
        assert_eq!(group_id(&tree, 2), Some(2));
        assert_eq!(group_id(&tree, 4), Some(4), "the run restarts after the div");
    }

    #[test]
    fn adjacent_leaves_share_a_group_id() {
        let tree = interpolated_tree();
        assert_eq!(group_id(&tree, 3), Some(3));
        assert_eq!(group_id(&tree, 4), Some(3));
        assert_eq!(group_id(&tree, 5), Some(3));
        // The wrapper is not a primitive leaf, so it never merges.
        assert_eq!(group_id(&tree, 2), None);
    }

    /// An empty interpolation must not split a line.
    #[test]
    fn an_empty_leaf_is_transparent() {
        let mut tree = interpolated_tree();
        tree.set_text(4, String::new());
        let groups = GroupList::collect(&tree, 1);
        assert_eq!(groups.groups.len(), 1);
        assert_eq!(groups.groups[0].text, "Hello !");
        assert_eq!(group_id(&tree, 5), Some(3));
    }

    /// The mutation API allows a declaration directly on a text leaf, where
    /// there is no wrapper to collect the content.
    #[test]
    fn a_declaring_leaf_collects_its_own_content() {
        let mut tree = RetainedTree::new();
        tree.create_element(1, "text".to_string());
        tree.set_text(1, "a fox here".to_string());
        let groups = GroupList::collect(&tree, 1);
        assert_eq!(groups.groups.len(), 1);
        assert_eq!(
            washes(&groups, &HighlightSet { specs: vec![spec("fox")] }).1,
            1
        );
    }

    /// Native runs continue one sequence, so `activeIndex` marks ONE match even
    /// when the element paints many strings.
    #[test]
    fn native_runs_share_one_active_sequence() {
        native_frame_reset();
        let mut s = spec("x");
        s.active_index = Some(2);
        let native = NativeHighlight {
            set: Arc::new(HighlightSet { specs: vec![s] }),
            offsets: vec![0],
        };
        let first: Arc<str> = "7:0".into();
        let second: Arc<str> = "7:1".into();
        let line_one = washes_for_native_run(&first, "x x", &native);
        let line_two = washes_for_native_run(&second, "x x", &native);
        let actives: Vec<bool> = line_one
            .iter()
            .chain(line_two.iter())
            .map(|wash| wash.active)
            .collect();
        assert_eq!(actives, vec![false, false, true, false]);
    }

    /// gpui can paint the same row twice in one frame. The second paint must
    /// reuse the ordinals rather than advance the cursor again.
    #[test]
    fn a_repainted_native_run_keeps_its_ordinals() {
        native_frame_reset();
        let mut s = spec("x");
        s.active_index = Some(0);
        let native = NativeHighlight {
            set: Arc::new(HighlightSet { specs: vec![s] }),
            offsets: vec![0],
        };
        let key: Arc<str> = "7:0".into();
        let first = washes_for_native_run(&key, "x x", &native);
        let again = washes_for_native_run(&key, "x x", &native);
        assert_eq!(first[0].active, again[0].active);
        assert!(again[0].active);
        assert!(!again[1].active);
    }

    /// Retained matches are numbered first, so a native run must not reuse
    /// ordinals that a `<text>` sibling already took.
    #[test]
    fn native_runs_continue_after_retained_matches() {
        native_frame_reset();
        let mut s = spec("x");
        s.active_index = Some(1);
        let native = NativeHighlight {
            set: Arc::new(HighlightSet { specs: vec![s] }),
            offsets: vec![1],
        };
        let key: Arc<str> = "7:0".into();
        let washes = washes_for_native_run(&key, "x x", &native);
        assert_eq!(
            washes.iter().map(|wash| wash.active).collect::<Vec<_>>(),
            vec![true, false]
        );
    }

    #[test]
    fn identity_ignores_the_find_cursor_but_not_the_query() {
        let groups = GroupList::collect(&interpolated_tree(), 1);
        let plain = resolve(&groups, &HighlightSet { specs: vec![spec("l")] });
        let mut moved = spec("l");
        moved.active_index = Some(1);
        moved.color = gpui::rgba(0x00ff00ff).into();
        let moved = resolve(&groups, &HighlightSet { specs: vec![moved] });
        assert_eq!(plain.identity(), moved.identity());
    }

    #[test]
    fn identity_changes_when_a_query_swaps_at_the_same_count() {
        let groups = GroupList::collect(&interpolated_tree(), 1);
        let a = resolve(&groups, &HighlightSet { specs: vec![spec("Hello")] });
        let b = resolve(&groups, &HighlightSet { specs: vec![spec("Tommy")] });
        assert_eq!(a.total, b.total);
        assert_ne!(a.identity(), b.identity());
    }

    #[test]
    fn matcher_hash_ignores_paint_only_fields() {
        let mut a = spec("foo");
        let mut b = spec("foo");
        b.active_index = Some(3);
        b.color = gpui::rgba(0x0000ffff).into();
        b.radius = 9.0;
        let set_a = HighlightSet { specs: vec![a.clone()] };
        let set_b = HighlightSet { specs: vec![b] };
        assert_eq!(set_a.matcher_hash(), set_b.matcher_hash());
        a.whole_word = true;
        let set_c = HighlightSet { specs: vec![a] };
        assert_ne!(set_a.matcher_hash(), set_c.matcher_hash());
    }
}
