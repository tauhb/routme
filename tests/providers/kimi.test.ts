import { describe, it, expect, vi } from 'vitest'
import { KimiProvider } from '../../src/providers/kimi.js'
import type { Account, NormalizedRequest } from '../../src/types.js'

const mockAccount: Account = {
  id: 'acc-1', provider: 'kimi', label: 'Kimi Free', credential: 'eyJ0eXAiOiJKV1QiLCJhbGci',
  status: 'active', rateLimitedUntil: null, lastUsed: null, addedAt: '2026-06-05T00:00:00Z',
}
const mockRequest: NormalizedRequest = {
  model: 'kimi', messages: [{ role: 'user', content: 'Hello' }], stream: true,
}

describe('KimiProvider', () => {
  it('isQuotaError detects 429', () => {
    expect(new KimiProvider().isQuotaError(429, '')).toBe(true)
  })

  it('isAuthError detects 401', () => {
    expect(new KimiProvider().isAuthError(401, '')).toBe(true)
  })

  it('sendMessage yields text from Kimi SSE', async () => {
    const sseBody = [
      'data: {"event":"cmpl","text":"Hello"}',
      'data: {"event":"cmpl","text":" world"}',
      'data: {"event":"all_done"}',
      '',
    ].join('\n')
    const mockStream = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close() },
    })
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'chat-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, body: mockStream })

    const chunks: string[] = []
    for await (const chunk of new KimiProvider().sendMessage(mockRequest, mockAccount)) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['Hello', ' world'])
  })
})
