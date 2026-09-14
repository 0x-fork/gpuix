---
'@gpuix/native': patch
---

Queue browser `focusElement()` calls made while the asynchronous WebGPU window opens.

The requested element receives focus after the first render creates its native focus
handle. Applications can focus an input from a mount effect without handling a
`GPUIX web window is not ready` startup error.
