import { describe, it, expect, vi } from 'vitest'
import { ChatGPTProvider } from '../../src/providers/chatgpt.js'
import type { Account, NormalizedRequest } from '../../src/types.js'

const mockAccount: Account = {
  id: 'acc-1', provider: 'chatgpt', label: 'ChatGPT Free', credential: 'eyJhbGciOiJSUzI1NiJ9.test',
  status: 'active', rateLimitedUntil: null, lastUsed: null, addedAt: '2026-06-05T00:00:00Z',
}
const mockRequest: NormalizedRequest = {
  model: 'gpt-4o', messages: [{ role: 'user', content: 'Hello' }], stream: true,
}

describe('ChatGPTProvider', () => {
  it('isQuotaError detects 429', () => {
    expect(new ChatGPTProvider().isQuotaError(429, '')).toBe(true)
  })

  it('isAuthError detects 401 and 403', () => {
    const p = new ChatGPTProvider()
    expect(p.isAuthError(401, '')).toBe(true)
    expect(p.isAuthError(403, '')).toBe(true)
  })

  it('sendMessage yields incremental text chunks', async () => {
    const sseBody = [
      'data: {"message":{"content":{"parts":["Hello"]},"status":"in_progress"}}',
      'data: {"message":{"content":{"parts":["Hello world"]},"status":"finished_successfully"}}',
      'data: [DONE]',
      '',
    ].join('\n')
    const mockStream = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close() },
    })
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, body: mockStream })

    const chunks: string[] = []
    for await (const chunk of new ChatGPTProvider().sendMessage(mockRequest, mockAccount)) {
      chunks.push(chunk)
    }
    // Should yield "Hello" then " world" (incremental, not accumulated)
    expect(chunks.join('')).toBe('Hello world')
  })
})
