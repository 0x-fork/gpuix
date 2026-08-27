/** A bounded, bidirectional message history built directly on `<virtual-list>`. */

import React, { memo, useCallback, useRef, useState } from 'react'
import {
  applyMacCpuThrottleFromEnv,
  flushSync,
  render,
  useGpuix,
  type EventPayload,
  type PublicInstance,
} from '@gpuix/react'
import dedent from 'string-dedent'
import { SafeMdxContent } from './chat'

const C = {
  canvas: '#1A1A1A',
  raised: '#232323',
  border: '#E6EAF212',
  text: '#E2E2E2',
  secondary: '#A3A3A3',
  tertiary: '#7D7D7D',
  accent: '#E2795B',
  avatar: '#343434',
}

const FONT_SANS = typeof window === 'undefined' ? 'Helvetica' : 'IBM Plex Sans'
const PAGE_CACHE_SIZE = 5
const LOAD_THRESHOLD = 2

export interface Message {
  id: string
  index: number
  author: string
  time: string
  source: string
}

export interface MessagePage {
  items: Message[]
  before: string | null
  after: string | null
}

export type MessagePageRequest =
  | { before: string }
  | { after: string }
  | { around: string }

export interface MessageApi {
  requests: MessagePageRequest[]
  initialPage(messageId?: string): MessagePage
  fetchPage(request: MessagePageRequest): Promise<MessagePage>
}

function messageId(index: number) {
  return `message-${String(index).padStart(3, '0')}`
}

function messageSource(index: number, count: number) {
  const target = (index + count - 16) % count
  const route = `/messages/${messageId(target)}`

  switch (index % 6) {
    case 0:
      return dedent`
        ## Message ${String(index).padStart(3, '0')}

        This is a longer response with **variable-height content**. It wraps across several lines and proves that the estimate is only used before GPUI measures it.

        [Open message ${String(target).padStart(3, '0')}](${route})
      `
    case 1:
      return dedent`
        ### Rendering path

        | Layer | Work | Retained rows |
        |:------|:-----|--------------:|
        | React | Reconcile loaded pages | bounded |
        | GPUIX | Keep host descriptions | bounded |
        | GPUI | Layout visible rows | viewport |
      `
    case 2:
      return dedent`
        The page endpoint uses exclusive cursors:

        \`\`\`ts
        const page = await fetchMessages({ before: firstMessage.id })
        setPages((current) => [page, ...current])
        \`\`\`
      `
    case 3:
      return dedent`
        > Stable message keys let GPUI keep the visible row anchored while an older page
        > is inserted above it.

        - Variable row heights
        - Bidirectional cursors
        - Bounded page cache
        - Safe MDX React nodes
      `
    case 4:
      return `Short reply ${String(index).padStart(3, '0')}.`
    default:
      return dedent`
        ### Virtualized

        GPUI measures this row only when it reaches the viewport. The React tree keeps only ${PAGE_CACHE_SIZE} pages, while \`<virtual-list>\` builds and paints only the rows near the viewport.
      `
  }
}

export function createFakeMessageApi({
  messageCount = 120,
  pageSize = 12,
  delayMs = 450,
}: {
  messageCount?: number
  pageSize?: number
  delayMs?: number
} = {}): MessageApi {
  const messages = Array.from({ length: messageCount }, (_, index): Message => ({
    id: messageId(index),
    index,
    author: index % 4 === 0 ? 'Tommy' : 'GPUIX',
    time: `${9 + Math.floor(index / 12)}:${String((index * 7) % 60).padStart(2, '0')}`,
    source: messageSource(index, messageCount),
  }))

  const indexOf = (id: string) => messages.findIndex((message) => message.id === id)
  const page = (start: number, end: number): MessagePage => {
    const items = messages.slice(Math.max(0, start), Math.min(messageCount, end))
    return {
      items,
      before: items[0]?.index === 0 ? null : items[0]?.id ?? null,
      after:
        items[items.length - 1]?.index === messageCount - 1
          ? null
          : items[items.length - 1]?.id ?? null,
    }
  }
  const around = (id?: string) => {
    if (!id) return page(messageCount - pageSize, messageCount)
    const index = indexOf(id)
    const start = Math.max(0, Math.min(index - Math.floor(pageSize / 2), messageCount - pageSize))
    return page(start, start + pageSize)
  }

  const requests: MessagePageRequest[] = []
  return {
    requests,
    initialPage: around,
    async fetchPage(request) {
      requests.push(request)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      if ('before' in request) {
        const end = indexOf(request.before)
        return page(end - pageSize, end)
      }
      if ('after' in request) {
        const start = indexOf(request.after) + 1
        return page(start, start + pageSize)
      }
      return around(request.around)
    },
  }
}

const MessageRow = memo(function MessageRow({
  message,
  onNavigate,
}: {
  message: Message
  onNavigate: (href: string) => void
}) {
  return (
    <div
      testId={`message-${message.id}`}
      style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        width: '100%',
        paddingTop: 12,
        paddingBottom: 12,
        paddingLeft: 24,
        paddingRight: 24,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', gap: 12, width: 760, maxWidth: '100%' }}>
        <div
          style={{
            width: 34,
            height: 34,
            flexShrink: 0,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: message.author === 'Tommy' ? C.accent : C.avatar,
          }}
        >
          <text style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>
            {message.author === 'Tommy' ? 'T' : 'G'}
          </text>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0, gap: 7 }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <text style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>{message.author}</text>
            <text style={{ color: C.tertiary, fontSize: 12 }}>{message.time}</text>
            <text style={{ color: C.tertiary, fontSize: 11 }}>{message.id}</text>
          </div>
          <SafeMdxContent source={message.source} onLinkClick={onNavigate} />
        </div>
      </div>
    </div>
  )
})

function mergePage(
  current: MessagePage[],
  incoming: MessagePage,
  direction: 'previous' | 'next'
) {
  if (incoming.items.length === 0) return current
  const known = new Set(current.flatMap((page) => page.items.map((message) => message.id)))
  const items = incoming.items.filter((message) => !known.has(message.id))
  if (items.length === 0) return current
  const nextPage = { ...incoming, items }
  const pages = direction === 'previous' ? [nextPage, ...current] : [...current, nextPage]
  return direction === 'previous'
    ? pages.slice(0, PAGE_CACHE_SIZE)
    : pages.slice(-PAGE_CACHE_SIZE)
}

export function InfiniteChatApp({
  api = createFakeMessageApi(),
  initialMessageId,
}: {
  api?: MessageApi
  initialMessageId?: string
} = {}) {
  const [pages, setPages] = useState(() => [api.initialPage(initialMessageId)])
  const [route, setRoute] = useState(
    initialMessageId ? `/messages/${initialMessageId}` : '/messages/latest'
  )
  const [loading, setLoading] = useState<'previous' | 'next' | 'route' | null>(null)
  const pending = useRef(false)
  const listRef = useRef<PublicInstance | null>(null)
  const { renderer } = useGpuix()
  const messages = pages.flatMap((page) => page.items)
  const before = pages[0]?.before ?? null
  const after = pages[pages.length - 1]?.after ?? null

  const loadPage = useCallback(
    async (direction: 'previous' | 'next') => {
      const cursor = direction === 'previous' ? before : after
      if (!cursor || pending.current) return
      pending.current = true
      setLoading(direction)
      const page = await api.fetchPage(
        direction === 'previous' ? { before: cursor } : { after: cursor }
      )
      flushSync(() => {
        setPages((current) => mergePage(current, page, direction))
        setLoading(null)
      })
      pending.current = false
    },
    [after, api, before]
  )

  const navigate = useCallback(
    async (href: string) => {
      const target = href.match(/^\/messages\/(message-\d+)$/)?.[1]
      if (!target || pending.current) return
      pending.current = true
      setLoading('route')
      const page = await api.fetchPage({ around: target })
      flushSync(() => {
        setPages([page])
        setRoute(href)
        setLoading(null)
      })
      pending.current = false
      const index = page.items.findIndex((message) => message.id === target)
      const id = listRef.current?.id
      if (id != null && index >= 0) renderer?.scrollToItem?.(id, index)
    },
    [api, renderer]
  )

  const handleVisibleRange = useCallback(
    (event: EventPayload) => {
      const start = Math.floor(event.startIndex ?? 0)
      const end = Math.ceil(event.endIndex ?? start + 1)
      if (start <= LOAD_THRESHOLD && before) {
        void loadPage('previous')
      } else if (end >= messages.length - LOAD_THRESHOLD && after) {
        void loadPage('next')
      }
    },
    [after, before, loadPage, messages.length]
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: C.canvas,
        color: C.text,
        fontFamily: FONT_SANS,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 50,
          flexShrink: 0,
          paddingLeft: 24,
          paddingRight: 24,
          borderBottomWidth: 1,
          borderColor: C.border,
        }}
      >
        <text style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>Infinite history</text>
        <text style={{ color: C.secondary, fontSize: 12 }}>{route}</text>
      </div>

      <div style={{ display: 'flex', flexGrow: 1, minHeight: 0, position: 'relative' }}>
        <virtual-list
          ref={listRef}
          alignment="bottom"
          estimatedItemHeight={150}
          overdraw={320}
          onVisibleRange={handleVisibleRange}
          style={{ width: '100%', height: '100%' }}
        >
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} onNavigate={navigate} />
          ))}
        </virtual-list>

        {loading && (
          <div
            testId={`loading-${loading}`}
            style={{
              position: 'absolute',
              top: loading === 'next' ? undefined : 12,
              bottom: loading === 'next' ? 12 : undefined,
              left: 0,
              right: 0,
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                paddingTop: 6,
                paddingBottom: 6,
                paddingLeft: 12,
                paddingRight: 12,
                borderRadius: 14,
                backgroundColor: C.raised,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <text style={{ color: C.secondary, fontSize: 12 }}>● Loading messages…</text>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const isEntryPoint =
  typeof Bun !== 'undefined'
    ? Bun.isStandaloneExecutable || Bun.main === import.meta.path
    : typeof process !== 'undefined' && process.argv[1]?.endsWith('infinite-chat.tsx')

if (isEntryPoint) {
  applyMacCpuThrottleFromEnv()
  render(<InfiniteChatApp />, {
    title: 'GPUIX Infinite History',
    width: 920,
    height: 760,
    titlebarTransparent: true,
    windowBackground: C.canvas,
    focus: process.env.GPUIX_BACKGROUND !== '1',
  })
}
