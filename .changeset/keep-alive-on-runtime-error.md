---
'@gpuix/react': patch
---

Keep the macOS window alive after a JavaScript runtime error.

A throw used to kill the frame loop that pumps AppKit, so the window froze
while bun exited. `startFrameLoop` now catches errors from `tick()` and
schedules the next pump. Native event callbacks catch throws from React
handlers. `render()` also installs `uncaughtException` and
`unhandledRejection` listeners so bun stays alive. The error is logged.
Save under `bun --hot` to remount.
