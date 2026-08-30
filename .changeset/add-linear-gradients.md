---
'@gpuix/native': minor
'@gpuix/react': minor
---

Add native two-stop linear gradients to the React `style.background` API.

```tsx
<div
  style={{
    background: {
      type: 'linear-gradient',
      angle: 90,
      stops: [
        { color: '#7c3aed', position: 0 },
        { color: '#06b6d4', position: 1 },
      ],
      colorSpace: 'oklab',
    },
  }}
/>
```

Gradients use GPUI's GPU shaders on every renderer. They support CSS angle
direction, rounded corners, `srgb` or `oklab` interpolation, and native
`hover` and `active` styles.
