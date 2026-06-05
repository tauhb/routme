import type { Provider, NormalizedRequest, Account, Message } from '../types.js'
import { parseSSEStream } from '../utils/sse.js'

export class GeminiProvider implements Provider {
  readonly id = 'gemini' as const

  private extractText(msg: Message): string {
    return typeof msg.content === 'string'
      ? msg.content
      : msg.content.filter(b => b.type === 'text').map(b => (b as any).text as string).join('')
  }

  async *sendMessage(request: NormalizedRequest, account: Account): AsyncIterable<string> {
    const model = request.model.startsWith('gemini') ? request.model : 'gemini-2.0-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${account.credential}`

    const contents = request.messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: this.extractText(m) }],
    }))

    const body: Record<string, unknown> = { contents }
    if (request.system) body.systemInstruction = { parts: [{ text: request.system }] }
    if (request.maxTokens || request.temperature !== undefined) {
      body.generationConfig = {
        ...(request.maxTokens ? { maxOutputTokens: request.maxTokens } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw Object.assign(new Error('gemini error'), { status: res.status })
    if (!res.body) throw new Error('no response body')

    yield* parseSSEStream(res.body, (data) => {
      try {
        const parsed = JSON.parse(data)
        return parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? null
      } catch { return null }
    })
  }

  isQuotaError(status: number): boolean { return status === 429 }
  isAuthError(status: number): boolean { return status === 401 || status === 403 }
}
