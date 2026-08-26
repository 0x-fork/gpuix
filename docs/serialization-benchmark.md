---
title: applyBatch serialization benchmark
description: >
  What the mutation wire format and the Rust data model actually cost, measured
  on the real ChatApp mutation queue. Covers why the codec is the smallest
  lever, why StyleDesc is 1392 bytes, and the compact tree that makes a
  million-element React tree affordable.
---

# applyBatch serialization benchmark

Every React commit turns into one `applyBatch(json)` call. This benchmark
measures what that costs on both sides of the FFI boundary, on the real
`ChatApp` queue rather than a synthetic one.

**Headline: the wire codec is the smallest lever.** Swapping JSON for
MessagePack buys 1.24x. Interning styles in the protocol and putting the style
behind a pointer in Rust buys **4.7x on decode, 42x fewer allocations, and 5.4x
on tree memory**, with no new dependency and no change to `apply_styles`.

Jump to [Recommended order](#recommended-order) for what to do.

## Running it

Two halves. The JS half writes the fixture the Rust half reads, so both measure
the same bytes.

```bash
cd examples
TURNS=10000 SAFE_MDX=1 bun run bench:serde     # writes tmp/batch-fixture.json

cd ../packages/native
cargo run --release --example bench_serde
```

`examples/bench-serialization.ts` installs a stub `NativeRenderer` that owns
`applyBatch`, so `wrapWithBatching` hands it the exact tuples production sends.
Nothing about the fixture is invented.

```
ChatApp ► reconciler ► wrapWithBatching ► CaptureRenderer.applyBatch(json)
                                                 │
                                    ┌────────────┴────────────┐
                                    ▼                         ▼
                            JS codec bench          tmp/batch-fixture.json
                                                              │
                                                              ▼
                                                packages/native/examples/bench_serde.rs
```

The Rust half installs a counting `GlobalAlloc`, so "live heap" is the real
resident cost of the tree, not a `size_of` estimate. It also asserts that the
compact tree and the current tree hold the same parents, the same child order
and the same styled elements before reporting any saving.

## The fixture

10 000 turns with safe-mdx enabled. 221 764 ops, 72 010 elements, 13.05 MB of
JSON.

| op | count | JSON bytes | share |
|---|---:|---:|---:|
| `setStyle` | 59 320 | 6.37 MB | 49.7% |
| `createElement` | 72 010 | 2.10 MB | 16.4% |
| `appendChild` | 72 009 | 1.92 MB | 15.0% |
| `setCustomPropValue` | 6 142 | 1.73 MB | 13.5% |
| `setText` | 12 255 | 0.70 MB | 5.4% |

Two facts decide everything below.

**Styles are half the payload and there are only 90 of them.** 59 320 `setStyle`
ops carry 90 distinct style objects. The same ~1.2 KB object is serialized,
shipped and parsed hundreds of times.

**261 unique strings account for 564 987 occurrences.** 5.45 MB of string bytes
collapse to 0.01 MB once deduplicated.

## JS side: encode

| codec | encode | decode | wire bytes | vs JSON | resident while alive |
|---|---:|---:|---:|---:|---:|
| `JSON.stringify` | 23.96 ms | 18.96 ms | 13.05 MB | 1.00x | **26.1 MB** |
| JSON ► utf8 Buffer | 25.20 ms | 21.41 ms | 13.05 MB | 1.00x | 13.0 MB |
| msgpackr | 18.83 ms | 25.01 ms | 10.29 MB | 0.79x | 10.3 MB |
| msgpackr records | 16.85 ms | 11.15 ms | 6.96 MB | 0.53x | 7.0 MB |
| cbor-x | 18.05 ms | 36.38 ms | 10.30 MB | 0.79x | 10.3 MB |

`JSON.stringify` costs **two bytes of JS heap per wire byte**. JSC keeps a
string as latin1 only when every code unit fits in a byte, and the chat payload
contains box-drawing characters. Encoding into a `Buffer` costs one byte per
wire byte, and that byte lives outside the JS heap where the GC never has to
walk it.

That is the one unambiguous JS-side memory win, and it does not require
changing the codec.

## JS side: protocol

Interning is not a codec feature. It changes what JS sends.

**Protocol A** replaces a repeated style object with `["setStyleRef", id, 7]`
plus one `["defineStyle", 7, {…}]` the first time that style is seen.
**Protocol B** adds a string table for every value that repeats.

| variant | JSON bytes | vs today | msgpackr records | vs today |
|---|---:|---:|---:|---:|
| today | 13.05 MB | 1.00x | 6.96 MB | 0.53x |
| A — interned styles | 8.10 MB | 0.62x | 6.05 MB | 0.46x |
| B — A + string table | 6.78 MB | 0.52x | **4.32 MB** | **0.33x** |

Protocol A alone also halves encode time, from 23.96 ms to 15.55 ms, because
`JSON.stringify` no longer walks 59 320 style objects.

## Rust side: decode

This is where the money is. Median of 5 runs, counting allocator.

| decode path | median | vs today | heap churn | allocations |
|---|---:|---:|---:|---:|
| **today** — `Vec<Value>` + clone + `from_value` | 63.7 ms | 1.00x | 206.8 MB | 1 755 376 |
| `Vec<Value>`, no clone | 56.4 ms | 1.13x | 150.9 MB | 1 294 094 |
| typed JSON ► `StyleDesc` | 71.1 ms | **0.89x** | 374.5 MB | 140 702 |
| typed JSON ► `CompactStyle` | 26.0 ms | 2.45x | 36.0 MB | 100 358 |
| typed msgpack ► `CompactStyle` | 19.6 ms | 3.24x | 42.3 MB | 100 356 |
| typed JSON ► `Box<StyleDesc>`, interned | **13.4 ms** | **4.74x** | 32.2 MB | 41 330 |
| typed JSON ► `CompactStyle`, interned | 14.8 ms | 4.30x | 32.1 MB | 41 115 |
| typed msgpack ► `CompactStyle`, interned | 10.8 ms | 5.91x | 38.4 MB | 41 113 |

**Once styles are interned, `CompactStyle` stops paying for itself.** Only 90 of
221 764 ops parse a style, so the 1392-byte struct is built 90 times and its
size no longer matters. `Box<StyleDesc>` keeps every named field, keeps
`apply_styles` untouched, and is marginally **faster**. Intern first; only
consider a compact style if a profile still points at style parsing.

### Today's path allocates the same data four times

`renderer.rs` takes `json: String`, so napi copies and UTF-8 validates the whole
payload before parsing starts. Then:

```
Rust String
   │
   ▼ serde_json::from_str            a String per key AND per value
Vec<serde_json::Value>
   │
   ▼ batch_payload -> value.clone()  a deep clone of the whole style map
serde_json::Value
   │
   ▼ serde_json::from_value          a String per StyleDesc field
StyleDesc
```

1.76 million allocations for 221 764 ops. Removing the `value.clone()` in
`batch_payload` alone is worth 1.15x and 460 000 allocations, costs nothing, and
needs no new dependency.

### A fat enum variant poisons the whole vector

The most useful negative result: going typed **without** fixing the style makes
things worse. `Op<StyleDesc>` is 1408 bytes, so a `Vec<Op<StyleDesc>>` of
221 764 ops reserves 312 MB regardless of how few ops carry a style. That path
churns 374.5 MB and is slower than the `serde_json::Value` tree it replaces.

`Op<CompactStyle>` is 104 bytes. Same code, 10x less churn.

## The data-oriented redesign

Everything in this section is a **phase two**. The recommended order above gets
5.4x on memory without any of it. Read this when 577 bytes per element is still
too much.

### `StyleDesc` is 1392 bytes for six properties

Around 80 `Option` fields, all inline, all allocated whether set or not. A real
element sets six. Three observations shrink it:

- GPUI consumes `Pixels(f32)`. Storing `f64` buys nothing
- a colour is 4 bytes once parsed, not a 24-byte `String` plus a heap block
- `display`, `position`, `alignItems` and friends are keyword enums, not text

So a style becomes a sorted list of 8-byte properties:

```rust
#[repr(C)]
struct StyleProp {
    key: u16,    // interned property name
    kind: u8,    // f32 | colour | keyword | bool | nested | percent | auto
    _pad: u8,
    bits: u32,   // f32 bits, or rgba8, or an id
}

struct CompactStyle { props: Box<[StyleProp]> }   // 16 B + 8 B per property
```

Parsing colours at ingest is a second win: paint stops calling `parse_color` on
every frame.

### `RetainedElement` costs 3102 bytes resident

`Option<StyleDesc>` is inline, so every element pays the full style size even
when it has none. Add a `String` element type, a `HashSet<String>` of event
names and a `HashMap<String, Value>` of custom props, and one node costs more
than a kilobyte before it holds any content. The `HashMap<u64, RetainedElement>`
that holds them rehashes 1.4 KB values as it grows.

The replacement is a fixed 44-byte record in a dense `Vec`, indexed by the id JS
already allocates as a counter. Children are a sibling list, so no node owns a
`Vec`. Everything variable-width moves to a side table that repeated values
share.

```rust
#[repr(C)]
struct CompactElement {
    parent: u32, first_child: u32, last_child: u32, next_sibling: u32,
    style: u32,           // index into a deduplicated style table
    content: u32, test_id: u32, custom_props: u32,
    subtree_revision: u32,
    events: u32,          // one bit per event type, was HashSet<String>
    kind: u16,            // div | text | input | …, was String
    custom_len: u16,
}
```

### Result

| tree | elements | live heap | per element | effort |
|---|---:|---:|---:|---|
| `RetainedTree` (today) | 72 010 | 223.4 MB | 3102 B | — |
| + `Box<StyleDesc>` | 72 010 | 124.6 MB | 1729 B | **one field** |
| + `Arc<StyleDesc>`, deduplicated | 72 010 | **41.6 MB** | **577 B** | one field plus an intern table |
| `CompactTree` | 72 010 | 9.2 MB | 127 B | rewrite every reader |

`size_of::<RetainedElement>()` is **1624 B** today and **240 B** with the style
behind a pointer. The `HashMap` holds the value inline, so that one field
decides the size of the whole table.

**5.4x of the available 24.4x costs one field change.** Everything reading
`Option<&StyleDesc>` keeps working through `Deref`, so `apply_styles` and every
custom element stay untouched. The remaining 4.5x needs the dense-`Vec` rewrite.

Extrapolated to the goal of virtualizing in Rust instead of React:

| elements | today | `Arc` deduplicated | `CompactTree` |
|---:|---:|---:|---:|
| 100 000 | 310 MB | 58 MB | 12.7 MB |
| 1 000 000 | **3.1 GB** | **577 MB** | **127 MB** |

## What codecs can and cannot do

No mainstream JS↔Rust codec deduplicates repeated string **values**.

| option | what it deduplicates | usable here |
|---|---|---|
| msgpackr `useRecords` | object **keys** per shape | yes, but keys are not the cost |
| msgpackr `bundleStrings` | nothing; groups strings for one JS `toString()` | no, Rust cannot read the extension |
| msgpackr `structuredClone` | repeated object **references** | no, React makes a fresh style object per element |
| Arrow dictionary arrays | string values, properly | columnar; a mutation stream is not a table |
| FlatBuffers `create_shared_string` | string values, properly | needs a schema and codegen for every op |

`msgpackr` with `useRecords: true` is also **not plain MessagePack**. `rmp_serde`
cannot read it; pnpm had to write a transcoder for the same reason. The 6.96 MB
row above is not a payload Rust can decode as-is.

So value deduplication has to happen in the protocol. Once styles are interned,
the codec choice is worth 1.3x and nothing else.

## Recommended order

Three changes, none of which needs a new dependency, a new codec, or a rewrite
of anything that reads a style.

**1. Intern styles in the batch protocol.** `batch-renderer.ts` emits
`["defineStyle", n, {…}]` the first time it sees a style object and
`["setStyleRef", id, n]` after that. 59 320 style payloads become 90.

**2. Replace the `Vec<Value>` decode with a typed op enum** carrying
`Box<StyleDesc>`. This deletes both `batch_payload`'s deep clone and the second
`from_value` parse. Keep the style boxed: an inline `StyleDesc` makes the whole
`Vec<Op>` 1408 bytes wide and ends up **slower than today**.

**3. Store `Option<Arc<StyleDesc>>` on `RetainedElement`**, resolved from a
style table keyed by the id in step 1.

Measured together:

| metric | today | after | change |
|---|---:|---:|---:|
| decode | 63.7 ms | 13.4 ms | **4.7x** |
| allocations | 1 755 376 | 41 330 | **42x** |
| heap churn | 206.8 MB | 32.2 MB | 6.4x |
| tree live heap | 223.4 MB | 41.6 MB | 5.4x |
| per element | 3102 B | 577 B | 5.4x |
| wire bytes | 13.05 MB | 8.10 MB | 1.6x |
| JS encode | 24.0 ms | 15.6 ms | 1.5x |

### Deliberately not doing yet

| change | measured gain | why not |
|---|---|---|
| MessagePack | 13.4 ► 10.8 ms, **1.24x** | a new dependency and a new codec on both sides, for a quarter |
| `CompactStyle` | **none** after step 1 | 80 property mappings and a rewrite of `apply_styles` for 13.4 ► 14.8 ms, which is worse |
| `CompactElement` dense tree | 41.6 ► 9.2 MB, 4.5x | every reader of `RetainedElement` changes. Do it when 1M elements is a real target |
| `Buffer` instead of `String` at the FFI | removes one 13 MB memcpy, unmeasured | worth doing, but measure it after step 2 shrinks everything else |

### After those three, the next cheap wins

Of the 577 bytes left per element, none is the style:

- `element_type: String` ► a `u16` tag. Removes a heap block per element
- `events: HashSet<String>` ► a `u32` bitmask. `HashSet` is 48 B plus heap
- `HashMap<u64, RetainedElement>` ► a dense `Vec`. JS already allocates ids as a
  counter, so the hash buys nothing

Each is contained and can land separately.

### None of this touches frame time

Every number here is **mount and memory**. A wheel event still costs Taffy on
the visible rows, and that is unchanged. Do not expect this work to move the
frame overlay.

## Known gaps

- `CompactStyle` is a benchmark prototype. Applying it to GPUI styles is not
  written or measured, and that path could give some of the win back.
- `setCustomPropValue` payloads still deserialize into `serde_json::Value` in
  every variant. They are 1.73 MB of the fixture and the largest strings in it;
  a borrowed representation is an unmeasured lever.
- The benchmark's interners are thread-locals. Production would thread them
  through `DeserializeSeed`, which is faster, so the compact numbers are
  slightly pessimistic.
- Escaped strings turned out to be rare in this fixture: exactly one of 312 198
  value strings had to be unescaped. MessagePack's guarantee that every string
  borrows is real, but it is worth almost nothing here.
