import { describe, it, expect, vi } from 'vitest'
import { ClaudeProvider } from '../../src/providers/claude.js'
import type { Account, NormalizedRequest } from '../../src/types.js'

const mockAccount: Account = {
  id: 'acc-1', provider: 'claude', label: 'Test', credential: 'session-key-xxx',
  status: 'active', rateLimitedUntil: null, lastUsed: null, addedAt: '2026-06-05T00:00:00Z',
}
const mockRequest: NormalizedRequest = {
  model: 'claude-3-5-sonnet', messages: [{ role: 'user', content: 'Hello' }], stream: true,
}

describe('ClaudeProvider', () => {
  it('isQuotaError detects 429', () => {
    expect(new ClaudeProvider().isQuotaError(429, '')).toBe(true)
    expect(new ClaudeProvider().isQuotaError(200, '')).toBe(false)
  })

  it('isAuthError detects 401 and 403', () => {
    const p = new ClaudeProvider()
    expect(p.isAuthError(401, '')).toBe(true)
    expect(p.isAuthError(403, '')).toBe(true)
    expect(p.isAuthError(200, '')).toBe(false)
  })

  it('sendMessage yields text chunks from SSE stream', async () => {
    const sseBody = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n')

    const mockStream = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close() },
    })

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ uuid: 'org-1' }]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ uuid: 'conv-1' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, body: mockStream })

    const chunks: string[] = []
    for await (const chunk of new ClaudeProvider().sendMessage(mockRequest, mockAccount)) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['Hello', ' world'])
  })
})
