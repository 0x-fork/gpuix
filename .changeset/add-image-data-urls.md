---
'@gpuix/native': minor
'@gpuix/react': minor
---

Add data URL sources to `<img>` for rendering images created or loaded in memory.

```tsx
const src = `data:image/png;base64,${Buffer.from(pngBytes).toString('base64')}`

<img src={src} style={{ width: 240, height: 140 }} />
```

Base64 and percent-encoded data URLs support PNG, JPEG, WebP, GIF, SVG, BMP,
TIFF, ICO, and Netpbm images.

Fixes #35
