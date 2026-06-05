import type { Provider, NormalizedRequest, Account } from '../types.js'
import { randomUUID } from 'crypto'

export class ChatGPTProvider implements Provider {
  readonly id = 'chatgpt' as const

  async *sendMessage(request: NormalizedRequest, account: Account): AsyncIterable<string> {
    const messages = [
      ...(request.system ? [{ id: randomUUID(), role: 'system', content: request.system }] : []),
      ...request.messages.map(m => ({
        id: randomUUID(),
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content.filter(b => b.type === 'text').map(b => (b as any).text).join(''),
      })),
    ]

    const res = await fetch('https://chatgpt.com/backend-api/conversation', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.credential}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        action: 'next',
        messages,
        model: 'gpt-4o',
        parent_message_id: randomUUID(),
        timezone_offset_min: 0,
        history_and_training_disabled: false,
      }),
    })
    if (!res.ok) throw Object.assign(new Error('chatgpt error'), { status: res.status })
    if (!res.body) throw new Error('no response body')

    let prevLength = 0
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
        try {
          const data = JSON.parse(line.slice(6))
          const parts = data?.message?.content?.parts
          if (!Array.isArray(parts)) continue
          const fullText = parts.join('')
          const newText = fullText.slice(prevLength)
          if (newText) yield newText
          prevLength = fullText.length
        } catch { /* ignore */ }
      }
    }
  }

  isQuotaError(status: number): boolean { return status === 429 }
  isAuthError(status: number): boolean { return status === 401 || status === 403 }
}
