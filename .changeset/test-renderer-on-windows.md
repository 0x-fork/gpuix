---
'@gpuix/native': minor
'@gpuix/react': minor
---

Run `TestGpuixRenderer`, `createTestRoot()`, native input simulation, and PNG screenshot capture on Windows through GPUI's DirectX renderer.

The testing API now supports the same native render path on macOS and Windows:

```tsx
import { createTestRoot } from '@gpuix/react/testing'

const { renderer, render } = createTestRoot({ width: 800, height: 600 })
render(<text style={{ color: '#fff' }}>Rendered by DirectX</text>)
renderer.captureScreenshot('windows-test.png')
```

Live-window automation can also call `captureScreenshot()` on Windows. Linux remains unavailable until GPUI provides its pending wgpu headless renderer.
