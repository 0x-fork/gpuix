---
'@gpuix/native': patch
---

Shrink the install by about **8x**. `@gpuix/native` packed every platform binary
into the main tarball through a `*.node` glob, on top of the six per-platform
packages that `optionalDependencies` already resolves.

A hello-world install paid for all of it:

```
node_modules                       254M
├── @gpuix/native                  185M  ◄── all six binaries, unused
├── @gpuix/native-darwin-arm64      23M  ◄── the one that loads
└── @gpuix/react                   544K
```

The glob is gone. Only the loader, the types, the browser entry, and the Wasm
build ship in the main package. Nothing changes at runtime: `index.js` still
resolves the platform package for the host.
