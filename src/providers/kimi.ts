import type { Provider, NormalizedRequest, Account } from '../types.js'
import { parseSSEStream } from '../utils/sse.js'

export class KimiProvider implements Provider {
  readonly id = 'kimi' as const

  private async createChat(credential: string): Promise<string> {
    const res = await fetch('https://kimi.moonshot.cn/api/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'RoutMe', is_example: false }),
    })
    if (!res.ok) throw Object.assign(new Error('kimi chat create failed'), { status: res.status })
    const data = await res.json() as { id: string }
    return data.id
  }

  async *sendMessage(request: NormalizedRequest, account: Account): AsyncIterable<string> {
    const chatId = await this.createChat(account.credential)

    const messages = request.messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content.filter(b => b.type === 'text').map(b => (b as any).text).join(''),
    }))

    const res = await fetch(`https://kimi.moonshot.cn/api/chat/${chatId}/completion/stream`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, refs: [], user_search: false }),
    })
    if (!res.ok) throw Object.assign(new Error('kimi error'), { status: res.status })
    if (!res.body) throw new Error('no response body')

    yield* parseSSEStream(res.body, (data) => {
      try {
        const parsed = JSON.parse(data)
        return parsed.event === 'cmpl' && parsed.text ? parsed.text as string : null
      } catch { return null }
    })
  }

  isQuotaError(status: number): boolean { return status === 429 }
  isAuthError(status: number): boolean { return status === 401 || status === 403 }
}
