---
'@gpuix/native': minor
'@gpuix/react': minor
'@gpuix/solid': minor
---

Add live image uploads and `scrollIntoView` on host refs.

`<img>` refs can push image bytes without a data URL or JSON mutation:

```tsx
const img = useRef<ImgInstance>(null)

useLayoutEffect(() => {
  img.current?.setImage(pngBuffer)
  img.current?.setImagePixels(800, 80, rgbaBytes)
}, [pngBuffer, rgbaBytes])

return <img ref={img} style={{ width: 800, height: 80 }} />
```

`setImage` takes encoded PNG, JPEG, WebP, GIF, SVG, BMP, TIFF, ICO, or Netpbm.
`setImagePixels` takes packed RGBA. Prefer pixels for a live frame. There is no
density argument. Upload a 2x bitmap into a 1x layout box on retina.

Every host ref now has `scrollIntoView()`, which scrolls the nearest overflow
parent or `<virtual-list>` until that node is visible.

The [waveform example](../examples/waveform.tsx) paints a generated buffer
through `setImagePixels`.
