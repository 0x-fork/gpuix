/** Exercises the bidirectional, cursor-paginated virtual chat example. */

import React from 'react'
import { connectTest } from '@gpuix/react/automation'
import { createTestRoot, hasNativeTestRenderer, type TestRenderer } from '@gpuix/react/testing'
import { describe, expect, it, vi } from 'vitest'
import { createFakeMessageApi, InfiniteChatApp } from './infinite-chat'

const describeNative = hasNativeTestRenderer ? describe : describe.skip

async function waitForRequest(renderer: TestRenderer, testId: string) {
  await vi.waitFor(() => {
    renderer.flush()
    expect(renderer.findByTestId(testId)).toBeUndefined()
  })
}

describeNative('infinite chat example', () => {
  it('renders a bounded Safe MDX page with variable-height content', () => {
    const api = createFakeMessageApi({ messageCount: 48, pageSize: 8, delayMs: 5 })
    const { render, renderer } = createTestRoot({ width: 900, height: 640 })

    render(<InfiniteChatApp api={api} />)

    const list = renderer.findByType('virtual-list')[0]
    expect(list.children).toHaveLength(8)
    expect(renderer.findByType('markdown')).toHaveLength(0)
    expect(renderer.findByType('code').length).toBeGreaterThan(0)
    expect(renderer.getAllText()).toContain('Rendering path')
    expect(renderer.getAllText()).toContain('Virtualized')
  })

  it('opens a message route from a Safe MDX link', async () => {
    const api = createFakeMessageApi({ messageCount: 48, pageSize: 8, delayMs: 50 })
    const { render, renderer } = createTestRoot({ width: 900, height: 640 })
    render(<InfiniteChatApp api={api} initialMessageId="message-024" />)

    const list = renderer.findByType('virtual-list')[0]
    renderer.scrollToItem(list.id, 4)

    const app = await connectTest(renderer)
    try {
      await app.getByText('Open message 008').click()
      expect(renderer.findByTestId('loading-route')).toBeDefined()
      await waitForRequest(renderer, 'loading-route')

      expect(renderer.getAllText()).toContain('/messages/message-008')
      expect(renderer.findByTestId('message-message-008')).toBeDefined()
      expect(api.requests[api.requests.length - 1]).toEqual({ around: 'message-008' })
    } finally {
      await app.close()
    }
  })

  it('pages to both ends, preserves retained rows, and stops requesting there', async () => {
    const api = createFakeMessageApi({ messageCount: 48, pageSize: 8, delayMs: 50 })
    const { render, renderer } = createTestRoot({ width: 900, height: 640 })
    render(<InfiniteChatApp api={api} initialMessageId="message-024" />)

    const targetId = renderer.findByTestId('message-message-024')!.id

    for (let attempt = 0; attempt < 6 && !renderer.findByTestId('message-message-000'); attempt++) {
      const list = renderer.findByType('virtual-list')[0]
      renderer.scrollToItem(list.id, 0)
      expect(renderer.findByTestId('loading-previous')).toBeDefined()
      await waitForRequest(renderer, 'loading-previous')
    }

    expect(renderer.findByTestId('message-message-000')).toBeDefined()
    expect(renderer.findByTestId('message-message-024')!.id).toBe(targetId)

    const requestsAtStart = api.requests.length
    renderer.scrollToItem(renderer.findByType('virtual-list')[0].id, 0)
    expect(api.requests).toHaveLength(requestsAtStart)
    expect(renderer.findByTestId('loading-previous')).toBeUndefined()

    for (let attempt = 0; attempt < 8 && !renderer.findByTestId('message-message-047'); attempt++) {
      const list = renderer.findByType('virtual-list')[0]
      renderer.scrollToItem(list.id, list.children.length - 1)
      expect(renderer.findByTestId('loading-next')).toBeDefined()
      await waitForRequest(renderer, 'loading-next')
      expect(renderer.findByType('virtual-list')[0].children.length).toBeLessThanOrEqual(40)
    }

    expect(renderer.findByTestId('message-message-047')).toBeDefined()
    const requestsAtEnd = api.requests.length
    const list = renderer.findByType('virtual-list')[0]
    renderer.scrollToItem(list.id, list.children.length - 1)
    expect(api.requests).toHaveLength(requestsAtEnd)
    expect(renderer.findByTestId('loading-next')).toBeUndefined()
  })
})
