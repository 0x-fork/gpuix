/**
 * Chat performance regression. Times mount, scroll draw, and chrome setState.
 * Not a visual test. Skip without the native GPU test renderer.
 *
 * Budgets are catastrophic-regression caps, not a 50% slowdown detector.
 * They leave room for machine noise. Tighten after CI has a baseline.
 *
 * Time dispatchScrollWheel(), not a later flush(). The wheel already draws.
 * A second flush() would measure a forced extra frame.
 *
 * NODE_ENV=production loads react.production.js and trims about 10% off
 * mount and sidebar click. Wheel draw does not change. Vitest default is
 * NODE_ENV=test (development React). Do not force production on all tests.
 *
 * THROTTLE=utility|background|maintenance re-execs under taskpolicy -c.
 * utility ≈ M1/M2 Air CPU. background ≈ 2019–2020 Intel Mac CPU.
 * A throttled run logs numbers and skips the default budgets.
 * macOS only. Do not set this in CI.
 */

import { createRequire } from 'node:module'
import React from 'react'
import { describe, expect, it } from 'vitest'
import {
  applyMacCpuThrottleFromEnv,
  createTestRoot,
  hasNativeTestRenderer,
  readMacCpuThrottle,
  type TestRoot,
} from '@gpuix/react'
import { connectTest } from '@gpuix/react/automation'
import { ChatApp } from './chat'

applyMacCpuThrottleFromEnv()

const describeNative = hasNativeTestRenderer ? describe : describe.skip
const require = createRequire(import.meta.url)
const throttle = readMacCpuThrottle() ?? 'off'

const TURNS = 1_000
const WARMUP = 10
const WHEEL_SAMPLES = 40
const WHEEL_X = 700
const WHEEL_Y = 400

const BUDGET = {
  mountMs: 150,
  idleP95Ms: 8,
  idleMaxMs: 16,
  wheelP95Ms: 8,
  wheelMaxMs: 16,
  sidebarMs: 40,
}

function loadedReactBuild(): string {
  const cache = require.cache
  if (!cache) return `unknown NODE_ENV=${process.env.NODE_ENV}`
  const keys = Object.keys(cache)
  if (keys.some((key) => key.includes('react.production'))) return 'production'
  if (keys.some((key) => key.includes('react.development'))) return 'development'
  return `unknown NODE_ENV=${process.env.NODE_ENV}`
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, index)]!
}

function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  return {
    n: samples.length,
    mean,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.at(-1) ?? 0,
  }
}

function impliedFps(ms: number): string {
  if (ms <= 0) return 'inf'
  return (1000 / ms).toFixed(0)
}

function report(label: string, samples: number[]) {
  const stats = summarize(samples)
  console.log(
    `[chat.perf] ${label} react=${loadedReactBuild()} NODE_ENV=${process.env.NODE_ENV} ` +
      `throttle=${throttle} ` +
      `n=${stats.n} mean=${stats.mean.toFixed(2)}ms p50=${stats.p50.toFixed(2)}ms ` +
      `p95=${stats.p95.toFixed(2)}ms (~${impliedFps(stats.p95)}fps) ` +
      `max=${stats.max.toFixed(2)}ms (~${impliedFps(stats.max)}fps)`,
  )
  return stats
}

function expectBudget(args: {
  label: string
  samples: number[]
  p95Max: number
  maxMax: number
}) {
  const stats = report(args.label, args.samples)
  if (throttle !== 'off') return stats
  expect(
    stats.p95,
    `${args.label} p95 ${stats.p95.toFixed(2)}ms exceeds ${args.p95Max}ms`,
  ).toBeLessThan(args.p95Max)
  expect(
    stats.max,
    `${args.label} max ${stats.max.toFixed(2)}ms exceeds ${args.maxMax}ms`,
  ).toBeLessThan(args.maxMax)
  return stats
}

function sampleFlushes(args: {
  renderer: TestRoot['renderer']
  count: number
  beforeFlush?: (index: number) => void
}): number[] {
  const samples: number[] = []
  for (let i = 0; i < args.count; i++) {
    args.beforeFlush?.(i)
    const start = performance.now()
    args.renderer.flush()
    samples.push(performance.now() - start)
  }
  return samples
}

it('rejects an unknown THROTTLE value', () => {
  const previous = process.env.THROTTLE
  process.env.THROTTLE = 'nope'
  try {
    expect(() => readMacCpuThrottle()).toThrow(/utility, background, or maintenance/)
  } finally {
    if (previous === undefined) delete process.env.THROTTLE
    else process.env.THROTTLE = previous
  }
})

describeNative('chat performance', () => {
  it('mounts 1000 turns under budget', () => {
    const { render } = createTestRoot()
    const start = performance.now()
    render(<ChatApp turnCount={TURNS} includeSafeMdx />)
    const mountMs = performance.now() - start
    console.log(
      `[chat.perf] mount react=${loadedReactBuild()} NODE_ENV=${process.env.NODE_ENV} ` +
        `throttle=${throttle} ${mountMs.toFixed(1)}ms turns=${TURNS}`,
    )
    if (throttle === 'off') {
      expect(mountMs, `mount ${mountMs.toFixed(1)}ms exceeds ${BUDGET.mountMs}ms`).toBeLessThan(
        BUDGET.mountMs,
      )
    }
  })

  it('keeps idle flush and wheel draw under budget', () => {
    const { render, renderer } = createTestRoot()
    render(<ChatApp turnCount={TURNS} includeSafeMdx />)

    sampleFlushes({ renderer, count: WARMUP })
    expectBudget({
      label: 'idle flush',
      samples: sampleFlushes({ renderer, count: WHEEL_SAMPLES }),
      p95Max: BUDGET.idleP95Ms,
      maxMax: BUDGET.idleMaxMs,
    })

    for (let i = 0; i < WARMUP; i++) {
      renderer.dispatchScrollWheel(WHEEL_X, WHEEL_Y, 0, i % 2 === 0 ? -160 : 160)
    }
    renderer.resetDebugFrameOverlayStats()
    renderer.flush()

    const wheel: number[] = []
    for (let i = 0; i < WHEEL_SAMPLES; i++) {
      const start = performance.now()
      renderer.dispatchScrollWheel(WHEEL_X, WHEEL_Y, 0, -160)
      wheel.push(performance.now() - start)
    }
    expectBudget({
      label: 'wheel',
      samples: wheel,
      p95Max: BUDGET.wheelP95Ms,
      maxMax: BUDGET.wheelMaxMs,
    })

    const overlay = renderer.getDebugFrameOverlayStats()
    console.log(
      `[chat.perf] overlay current=${overlay.currentMs?.toFixed(2)}ms ` +
        `p90=${overlay.p90Ms?.toFixed(2)}ms p99=${overlay.p99Ms?.toFixed(2)}ms ` +
        `max=${overlay.maxMs?.toFixed(2)}ms samples=${overlay.samples}`,
    )
    expect(overlay.samples).toBeGreaterThan(0)
    if (throttle === 'off') {
      expect(overlay.p90Ms ?? 0).toBeLessThan(BUDGET.wheelP95Ms)
      expect(overlay.maxMs ?? 0).toBeLessThan(BUDGET.wheelMaxMs)
    }
  })

  it('keeps a sidebar click under budget', async () => {
    const { render, renderer } = createTestRoot()
    render(<ChatApp turnCount={TURNS} includeSafeMdx />)
    const app = await connectTest(renderer)
    await app.getByTestId('sidebar-collapse').waitFor()
    await app.clock.pause()

    const samples: number[] = []
    for (let i = 0; i < 8; i++) {
      const testId = i % 2 === 0 ? 'sidebar-collapse' : 'sidebar-expand'
      const start = performance.now()
      await app.getByTestId(testId).click()
      samples.push(performance.now() - start)
      await app.clock.fastForward(200)
    }
    await app.clock.resume()
    const stats = report('sidebar click', samples)
    if (throttle === 'off') {
      expect(
        stats.max,
        `sidebar click ${stats.max.toFixed(1)}ms exceeds ${BUDGET.sidebarMs}ms`,
      ).toBeLessThan(BUDGET.sidebarMs)
    }
  })
})
