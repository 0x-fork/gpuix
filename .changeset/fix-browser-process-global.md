---
'@gpuix/react': patch
'@gpuix/native': patch
---

Stop the browser chat example from dying before the WebGPU window opens.

https://gpuix.dev/chat-example/ stayed on the loading screen for two reasons:

1. The error overlay picked a monospace font from `process.platform` at module
   load. In a browser that throws `process is not defined` before Wasm starts.
2. `createRoot()` called `setWindowKeyEvents` before GPUI finished opening the
   web window, which threw `GPUIX web window is not ready`.

The overlay now uses a CSS font stack. `readMacCpuThrottle()` treats a missing
`process` as no throttle. The web renderer queues window-key listeners until
the window exists, the same way it already queues the debug overlay.

The production chat bundle also copies `web.css`, so the loader styles load
from `/chat-example/web.css`.
