import type { Provider, NormalizedRequest, Account } from '../types.js'
import { parseSSEStream } from '../utils/sse.js'
import { browserHeaders } from '../utils/headers.js'

const ORIGIN = 'https://kimi.moonshot.cn'

export class KimiProvider implements Provider {
  readonly id = 'kimi' as const

  private async createChat(credential: string): Promise<string> {
    const res = await fetch(`${ORIGIN}/api/chat`, {
      method: 'POST',
      headers: browserHeaders(ORIGIN, {
        'Authorization': `Bearer ${credential}`,
        'Content-Type': 'application/json',
      }),
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

    const res = await fetch(`${ORIGIN}/api/chat/${chatId}/completion/stream`, {
      method: 'POST',
      headers: browserHeaders(ORIGIN, {
        'Authorization': `Bearer ${account.credential}`,
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ messages, refs: [], user_search: false }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      throw Object.assign(new Error('kimi error'), { status: res.status, body: errBody })
    }
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
