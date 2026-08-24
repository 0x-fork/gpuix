/// Re-exec vitest under `taskpolicy -c` when THROTTLE is set.
/// Must run in the main process. Workers inherit the clamp.
import { applyMacCpuThrottleFromEnv } from '@gpuix/react'
import { defineConfig } from 'vitest/config'

applyMacCpuThrottleFromEnv()

export default defineConfig({})
