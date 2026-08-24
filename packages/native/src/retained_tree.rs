/// Retained element tree — the Rust-side source of truth for the UI.
///
/// React's reconciler sends mutations (create, append, remove, etc.) via napi.
/// This tree stores those mutations. GpuixView builds ephemeral GPUI elements
/// from it, while virtual lists defer offscreen subtrees until layout requests them.
///
/// All IDs are u64 — JS generates them with an incrementing counter,
/// passes them as numbers across napi (no string allocation).
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::style::StyleDesc;

pub struct RetainedElement {
    pub id: u64,
    pub element_type: String,
    pub style: Option<Arc<StyleDesc>>,
    style_intern_id: Option<u32>,
    pub content: Option<String>,
    pub events: HashSet<String>,
    pub children: Vec<u64>,
    pub parent: Option<u64>,
    /// Props for custom elements (input, editor, diff, etc.).
    /// Keyed by prop name, values are JSON. Ignored for "div" and "text".
    pub custom_props: HashMap<String, serde_json::Value>,
    /// Take keyboard focus the first time this element gets a focus handle.
    /// Without it an `<input>` is dead until the user clicks it.
    pub auto_focus: bool,
    /// Last mutation applied to this element or one of its descendants.
    pub subtree_revision: u64,
    /// Stable locator id from the React `testId` prop.
    pub test_id: Option<String>,
}

impl RetainedElement {
    pub fn new(id: u64, element_type: String, revision: u64) -> Self {
        Self {
            id,
            element_type,
            style: None,
            style_intern_id: None,
            content: None,
            events: HashSet::new(),
            children: Vec::new(),
            parent: None,
            auto_focus: false,
            subtree_revision: revision,
            test_id: None,
            custom_props: HashMap::new(),
        }
    }
}

pub struct RetainedTree {
    pub elements: HashMap<u64, RetainedElement>,
    interned_styles: HashMap<u32, Arc<StyleDesc>>,
    /// The root element ID set by appendChildToContainer.
    pub root_id: Option<u64>,
    next_revision: u64,
}

impl RetainedTree {
    pub fn new() -> Self {
        Self {
            elements: HashMap::new(),
            interned_styles: HashMap::new(),
            root_id: None,
            next_revision: 1,
        }
    }

    pub fn create_element(&mut self, id: u64, element_type: String) {
        let revision = self.take_revision();
        self.elements
            .insert(id, RetainedElement::new(id, element_type, revision));
    }

    fn take_revision(&mut self) -> u64 {
        let revision = self.next_revision;
        self.next_revision = self.next_revision.wrapping_add(1).max(1);
        revision
    }

    fn mark_changed(&mut self, id: u64) {
        let revision = self.take_revision();
        let mut current = Some(id);
        while let Some(current_id) = current {
            let Some(element) = self.elements.get_mut(&current_id) else {
                break;
            };
            element.subtree_revision = revision;
            current = element.parent;
        }
    }

    /// Recursively destroy an element and all its children.
    /// Returns all destroyed IDs so the caller can clean up JS-side state.
    pub fn destroy_element(&mut self, id: u64) -> Vec<u64> {
        let mut destroyed = Vec::new();
        self.destroy_element_recursive(id, &mut destroyed);
        if self.root_id == Some(id) {
            self.root_id = None;
        }
        destroyed
    }

    fn destroy_element_recursive(&mut self, id: u64, destroyed: &mut Vec<u64>) {
        if let Some(element) = self.elements.remove(&id) {
            destroyed.push(id);
            for child_id in element.children {
                self.destroy_element_recursive(child_id, destroyed);
            }
        }
    }

    pub fn intern_style(&mut self, style_id: u32, style: StyleDesc) -> Result<(), String> {
        if let Some(existing) = self.interned_styles.get(&style_id) {
            if existing.as_ref() != &style {
                return Err(format!(
                    "Interned style id {style_id} already has a different style"
                ));
            }
            return Ok(());
        }
        self.interned_styles.insert(style_id, Arc::new(style));
        Ok(())
    }

    pub fn has_interned_style(&self, style_id: u32) -> bool {
        self.interned_styles.contains_key(&style_id)
    }

    pub fn interned_style(&self, style_id: u32) -> Option<&StyleDesc> {
        self.interned_styles.get(&style_id).map(|style| style.as_ref())
    }

    pub fn set_style_id(&mut self, id: u64, style_id: u32) -> Result<(), String> {
        let Some(style) = self.interned_styles.get(&style_id).cloned() else {
            return Err(format!("Unknown interned style id {style_id}"));
        };
        let previous = self
            .elements
            .get(&id)
            .and_then(|element| element.style_intern_id);
        if previous == Some(style_id) {
            return Ok(());
        }
        let Some(element) = self.elements.get_mut(&id) else {
            return Ok(());
        };
        let visual_changed = element.style.as_deref() != Some(style.as_ref());
        element.style = Some(style);
        element.style_intern_id = Some(style_id);
        if visual_changed {
            self.mark_changed(id);
        }
        Ok(())
    }

    #[cfg(test)]
    pub fn interned_style_count(&self) -> usize {
        self.interned_styles.len()
    }

    pub fn append_child(&mut self, parent_id: u64, child_id: u64) {
        // Remove from old parent if any
        let old_parent_id = self.elements.get(&child_id).and_then(|e| e.parent);
        if let Some(old_parent_id) = old_parent_id {
            if let Some(old_parent) = self.elements.get_mut(&old_parent_id) {
                old_parent.children.retain(|c| *c != child_id);
            }
        }
        // Set new parent
        if let Some(child) = self.elements.get_mut(&child_id) {
            child.parent = Some(parent_id);
        }
        // Add to new parent's children
        if let Some(parent) = self.elements.get_mut(&parent_id) {
            parent.children.push(child_id);
        }
        if let Some(old_parent_id) = old_parent_id {
            self.mark_changed(old_parent_id);
        }
        self.mark_changed(parent_id);
    }

    pub fn remove_child(&mut self, parent_id: u64, child_id: u64) {
        if let Some(parent) = self.elements.get_mut(&parent_id) {
            parent.children.retain(|c| *c != child_id);
        }
        if let Some(child) = self.elements.get_mut(&child_id) {
            child.parent = None;
        }
        self.mark_changed(parent_id);
    }

    pub fn insert_before(&mut self, parent_id: u64, child_id: u64, before_id: u64) {
        // Remove from old parent if any
        let old_parent_id = self.elements.get(&child_id).and_then(|e| e.parent);
        if let Some(old_parent_id) = old_parent_id {
            if let Some(old_parent) = self.elements.get_mut(&old_parent_id) {
                old_parent.children.retain(|c| *c != child_id);
            }
        }
        // Set new parent
        if let Some(child) = self.elements.get_mut(&child_id) {
            child.parent = Some(parent_id);
        }
        // Insert before the target
        if let Some(parent) = self.elements.get_mut(&parent_id) {
            let pos = parent
                .children
                .iter()
                .position(|c| *c == before_id)
                .unwrap_or(parent.children.len());
            parent.children.insert(pos, child_id);
        }
        if let Some(old_parent_id) = old_parent_id {
            self.mark_changed(old_parent_id);
        }
        self.mark_changed(parent_id);
    }

    pub fn set_style(&mut self, id: u64, style: StyleDesc) {
        let mut changed = false;
        if let Some(element) = self.elements.get_mut(&id) {
            if element.style.as_deref() != Some(&style) {
                element.style = Some(Arc::new(style));
                changed = true;
            }
            element.style_intern_id = None;
        }
        if changed {
            self.mark_changed(id);
        }
    }

    pub fn set_text(&mut self, id: u64, content: String) {
        let mut changed = false;
        if let Some(element) = self.elements.get_mut(&id) {
            if element.content.as_ref() != Some(&content) {
                element.content = Some(content);
                changed = true;
            }
        }
        if changed {
            self.mark_changed(id);
        }
    }

    pub fn set_event_listener(&mut self, id: u64, event_type: String, has_handler: bool) {
        if let Some(element) = self.elements.get_mut(&id) {
            if has_handler {
                element.events.insert(event_type);
            } else {
                element.events.remove(&event_type);
            }
        }
    }

    /// Set a custom prop on an element (for non-div/text elements).
    pub fn set_custom_prop(&mut self, id: u64, key: String, value: serde_json::Value) {
        let mut changed = false;
        if let Some(element) = self.elements.get_mut(&id) {
            // `autoFocus` applies to every element type, so it is lifted out of
            // the custom-prop map that only custom elements read.
            if key == "autoFocus" {
                element.auto_focus = value.as_bool().unwrap_or(false);
                return;
            }
            if key == "testId" {
                element.test_id = value.as_str().map(str::to_string);
                return;
            }
            if value.is_null() {
                changed = element.custom_props.remove(&key).is_some();
            } else {
                if element.custom_props.get(&key) != Some(&value) {
                    element.custom_props.insert(key, value);
                    changed = true;
                }
            }
        }
        if changed {
            self.mark_changed(id);
        }
    }

    /// Read a custom prop value from an element.
    pub fn get_custom_prop(&self, id: u64, key: &str) -> Option<&serde_json::Value> {
        self.elements.get(&id)?.custom_props.get(key)
    }

    pub fn to_json(
        &self,
        bounds: &std::collections::HashMap<u64, crate::automation::ElementBounds>,
    ) -> serde_json::Value {
        self.to_json_detail(bounds, true)
    }

    /// Locator tree. Skip style maps so a 5k-row list is not 100ms of JSON.
    pub fn to_automation_json(
        &self,
        bounds: &std::collections::HashMap<u64, crate::automation::ElementBounds>,
    ) -> serde_json::Value {
        self.to_json_detail(bounds, false)
    }

    fn to_json_detail(
        &self,
        bounds: &std::collections::HashMap<u64, crate::automation::ElementBounds>,
        include_details: bool,
    ) -> serde_json::Value {
        match self.root_id {
            Some(root_id) => element_to_json(root_id, self, bounds, include_details),
            None => serde_json::Value::Null,
        }
    }
}

fn element_to_json(
    id: u64,
    tree: &RetainedTree,
    bounds: &std::collections::HashMap<u64, crate::automation::ElementBounds>,
    include_details: bool,
) -> serde_json::Value {
    let Some(element) = tree.elements.get(&id) else {
        return serde_json::Value::Null;
    };

    let mut obj = serde_json::Map::new();
    obj.insert(
        "type".to_string(),
        serde_json::Value::String(element.element_type.clone()),
    );
    obj.insert("id".to_string(), serde_json::json!(element.id));

    if let Some(ref test_id) = element.test_id {
        obj.insert(
            "testId".to_string(),
            serde_json::Value::String(test_id.clone()),
        );
    }

    if let Some(ref content) = element.content {
        obj.insert(
            "text".to_string(),
            serde_json::Value::String(content.clone()),
        );
    }

    if let Some(rect) = bounds.get(&id) {
        obj.insert(
            "bounds".to_string(),
            serde_json::json!({
                "x": rect.x,
                "y": rect.y,
                "width": rect.width,
                "height": rect.height,
            }),
        );
    }

    if include_details {
        if let Some(ref style) = element.style {
            if let Ok(style_json) = serde_json::to_value(style) {
                if let serde_json::Value::Object(ref map) = style_json {
                    let filtered: serde_json::Map<String, serde_json::Value> = map
                        .iter()
                        .filter(|(_, v)| !v.is_null())
                        .map(|(k, v)| (k.clone(), v.clone()))
                        .collect();
                    if !filtered.is_empty() {
                        obj.insert("style".to_string(), serde_json::Value::Object(filtered));
                    }
                }
            }
        }

        if !element.events.is_empty() {
            let mut events: Vec<String> = element.events.iter().cloned().collect();
            events.sort();
            obj.insert("events".to_string(), serde_json::json!(events));
        }

        if !element.custom_props.is_empty() {
            let custom: serde_json::Map<String, serde_json::Value> = element
                .custom_props
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            obj.insert("customProps".to_string(), serde_json::Value::Object(custom));
        }
    }

    if !element.children.is_empty() {
        let children: Vec<serde_json::Value> = element
            .children
            .iter()
            .map(|&cid| element_to_json(cid, tree, bounds, include_details))
            .filter(|v| !v.is_null())
            .collect();
        if !children.is_empty() {
            obj.insert("children".to_string(), serde_json::Value::Array(children));
        }
    }

    serde_json::Value::Object(obj)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::mem::size_of;

    fn sample_style() -> StyleDesc {
        StyleDesc {
            display: Some("flex".into()),
            height: Some(crate::style::DimensionValue::Pixels(40.0)),
            ..Default::default()
        }
    }

    #[test]
    fn style_desc_size_is_tracked() {
        assert_eq!(
            size_of::<StyleDesc>(),
            1272,
            "StyleDesc grew. Prefer a sparse style over new Option fields."
        );
    }

    #[test]
    fn shared_style_ids_share_one_intern_entry() {
        let mut tree = RetainedTree::new();
        tree.create_element(1, "div".into());
        tree.create_element(2, "div".into());
        tree.intern_style(1, sample_style()).unwrap();
        tree.set_style_id(1, 1).unwrap();
        tree.set_style_id(2, 1).unwrap();
        assert_eq!(tree.interned_style_count(), 1);
        assert!(Arc::ptr_eq(
            tree.elements.get(&1).unwrap().style.as_ref().unwrap(),
            tree.elements.get(&2).unwrap().style.as_ref().unwrap(),
        ));
    }

    #[test]
    fn destroying_last_user_keeps_interned_style() {
        let mut tree = RetainedTree::new();
        tree.create_element(1, "div".into());
        tree.create_element(2, "div".into());
        tree.intern_style(1, sample_style()).unwrap();
        tree.set_style_id(1, 1).unwrap();
        tree.set_style_id(2, 1).unwrap();
        tree.destroy_element(1);
        tree.destroy_element(2);
        assert_eq!(tree.interned_style_count(), 1);
        tree.create_element(3, "div".into());
        tree.set_style_id(3, 1).unwrap();
        assert!(Arc::ptr_eq(
            tree.elements.get(&3).unwrap().style.as_ref().unwrap(),
            tree.interned_styles.get(&1).unwrap(),
        ));
    }

    #[test]
    fn intern_style_rejects_conflicting_reuse() {
        let mut tree = RetainedTree::new();
        tree.intern_style(1, sample_style()).unwrap();
        let mut other = sample_style();
        other.display = Some("block".into());
        assert!(tree.intern_style(1, other).is_err());
    }

    #[test]
    fn hide_then_restore_keeps_interned_style() {
        let mut tree = RetainedTree::new();
        tree.create_element(1, "div".into());
        tree.intern_style(1, sample_style()).unwrap();
        tree.set_style_id(1, 1).unwrap();
        tree.set_style(
            1,
            StyleDesc {
                visibility: Some("hidden".into()),
                ..Default::default()
            },
        );
        tree.set_style_id(1, 1).unwrap();
        assert_eq!(
            tree.elements.get(&1).unwrap().style.as_deref().unwrap().display.as_deref(),
            Some("flex")
        );
    }

    #[test]
    fn set_style_id_rejects_unknown_intern_id() {
        let mut tree = RetainedTree::new();
        tree.create_element(1, "div".into());
        assert!(tree.set_style_id(1, 99).is_err());
    }
}
