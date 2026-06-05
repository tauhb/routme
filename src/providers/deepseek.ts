import type { Provider, NormalizedRequest, Account } from '../types.js'
import { parseOpenAISSE } from '../utils/sse.js'

export class DeepSeekProvider implements Provider {
  readonly id = 'deepseek' as const

  async *sendMessage(request: NormalizedRequest, account: Account): AsyncIterable<string> {
    const messages = [
      ...(request.system ? [{ role: 'system', content: request.system }] : []),
      ...request.messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content.filter(b => b.type === 'text').map(b => (b as any).text).join(''),
      })),
    ]

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        stream: true,
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      }),
    })
    if (!res.ok) throw Object.assign(new Error('deepseek error'), { status: res.status })
    if (!res.body) throw new Error('no response body')
    yield* parseOpenAISSE(res.body)
  }

  isQuotaError(status: number): boolean { return status === 429 }
  isAuthError(status: number): boolean { return status === 401 || status === 403 }
}
