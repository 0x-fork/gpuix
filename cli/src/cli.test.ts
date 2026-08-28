// Verifies that the CLI creates a usable app from the real GPUIX template.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { createGpuixApp } from './cli.ts'

const testWithGitHub = process.env.GITHUB_TOKEN ? test : test.skip
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('createGpuixApp', () => {
  testWithGitHub('extracts example-app and makes its dependencies installable', async () => {
    const parentDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'gpuix-cli-'))
    temporaryDirectories.push(parentDirectory)
    const targetDirectory = path.join(parentDirectory, 'my-app')

    await createGpuixApp({
      targetDirectory,
      githubToken: process.env.GITHUB_TOKEN,
    })

    const files = await fs.readdir(targetDirectory)
    const packageJson = JSON.parse(
      await fs.readFile(path.join(targetDirectory, 'package.json'), 'utf8'),
    )

    expect(files).toContain('app.tsx')
    expect(files).toContain('assets')
    expect(packageJson.name).toBe('my-app')
    expect(packageJson.dependencies['@gpuix/react']).toMatch(/^\^\d+\.\d+\.\d+/)
  })
})
