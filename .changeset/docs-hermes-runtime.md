---
'@gpuix/react': patch
---

Document how to ship a GPUIX React app on [hermes-node](https://github.com/tmikov/hermes-node) instead of Bun or Node.

The guide is at `website/src/guides/hermes.mdx` and is linked from the README. It covers the macOS rebuild (the published tarball strips `napi_*`), `bun build --format=cjs` plus a leftover `import()` rewrite, and the measured ship set: **12 MB** executable plus a **22 MB** native sidecar.
