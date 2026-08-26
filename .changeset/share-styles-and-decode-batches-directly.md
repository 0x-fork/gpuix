---
"@gpuix/native": patch
---

Make a large mount 4x faster and cut the retained tree 5x.

`applyBatch` used to build a `serde_json::Value` tree, deep-clone every style payload out of it, and parse the clone a second time into a `StyleDesc`. Each style was therefore allocated three times. The batch then landed in a `Vec<BatchOp>` whose `SetStyle` variant held a 1.4 KB `StyleDesc` inline, so a 220k-op mount reserved over 300 MB before it parsed a single op.

The batch now deserializes straight from its JSON bytes into typed ops. Strings borrow out of the input, so an element type or a text run is copied once instead of twice, and the intermediate tree is gone.

Styles are also shared by content. A 10,000-turn chat sends 59,320 `setStyle` ops carrying 90 distinct styles; the tree hashes the raw payload and hands every element the same `Arc`. `RetainedElement` drops from 1624 bytes to 248, and because the element map stores values inline that shrinks the whole table. Styles nothing references are released after each batch, so an element whose style changes every frame during a drag cannot grow the table.

Measured on a 10,000-turn chat, 221,764 ops:

| | before | after |
|---|---:|---:|
| parse and apply | 127.1 ms | 30.1 ms |
| heap churn | 900.5 MB | 104.0 MB |
| allocations | 1,476,196 | 186,090 |
| retained tree | 224.5 MB | 42.6 MB |
| bytes per element | 3116 B | 592 B |

`RetainedElement.style` is now `Option<Arc<StyleDesc>>`. Read it with `.as_deref()`. It cannot be mutated in place, which is what keeps one element's animation from restyling every element that declared the same style.
