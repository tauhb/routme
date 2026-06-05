import { describe, it, expect, vi } from 'vitest'
import { DeepSeekProvider } from '../../src/providers/deepseek.js'
import type { Account, NormalizedRequest } from '../../src/types.js'

const mockAccount: Account = {
  id: 'acc-1', provider: 'deepseek', label: 'DeepSeek Free', credential: 'sk-test',
  status: 'active', rateLimitedUntil: null, lastUsed: null, addedAt: '2026-06-05T00:00:00Z',
}
const mockRequest: NormalizedRequest = {
  model: 'deepseek-chat', messages: [{ role: 'user', content: 'Hello' }], stream: true,
}

describe('DeepSeekProvider', () => {
  it('isQuotaError detects 429', () => {
    expect(new DeepSeekProvider().isQuotaError(429, '')).toBe(true)
  })

  it('isAuthError detects 401', () => {
    expect(new DeepSeekProvider().isAuthError(401, '')).toBe(true)
  })

  it('sendMessage yields text from OpenAI-format SSE', async () => {
    const sseBody = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      'data: [DONE]',
      '',
    ].join('\n')
    const mockStream = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close() },
    })
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, body: mockStream })

    const chunks: string[] = []
    for await (const chunk of new DeepSeekProvider().sendMessage(mockRequest, mockAccount)) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['Hello', ' world'])
  })
})
