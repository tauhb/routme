import { describe, it, expect, vi } from 'vitest'
import { GeminiProvider } from '../../src/providers/gemini.js'
import type { Account, NormalizedRequest } from '../../src/types.js'

const mockAccount: Account = {
  id: 'acc-1', provider: 'gemini', label: 'Gemini Free', credential: 'AIza-test-key',
  status: 'active', rateLimitedUntil: null, lastUsed: null, addedAt: '2026-06-05T00:00:00Z',
}
const mockRequest: NormalizedRequest = {
  model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }], stream: true,
}

describe('GeminiProvider', () => {
  it('isQuotaError detects 429', () => {
    expect(new GeminiProvider().isQuotaError(429, '')).toBe(true)
  })

  it('isAuthError detects 401 and 403', () => {
    const p = new GeminiProvider()
    expect(p.isAuthError(401, '')).toBe(true)
    expect(p.isAuthError(403, '')).toBe(true)
  })

  it('sendMessage yields text chunks', async () => {
    const sseBody = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}',
      '',
    ].join('\n')
    const mockStream = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close() },
    })
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, body: mockStream })

    const chunks: string[] = []
    for await (const chunk of new GeminiProvider().sendMessage(mockRequest, mockAccount)) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['Hello', ' world'])
  })
})
