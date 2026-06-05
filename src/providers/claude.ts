import type { Provider, NormalizedRequest, Account, Message } from '../types.js'
import { parseSSEStream } from '../utils/sse.js'

export class ClaudeProvider implements Provider {
  readonly id = 'claude' as const

  private async getOrgId(credential: string): Promise<string> {
    const res = await fetch('https://claude.ai/api/organizations', {
      headers: { Cookie: `sessionKey=${credential}`, 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) throw Object.assign(new Error('claude org fetch failed'), { status: res.status })
    const orgs = await res.json() as Array<{ uuid: string }>
    return orgs[0].uuid
  }

  private async createConversation(orgId: string, credential: string): Promise<string> {
    const res = await fetch(`https://claude.ai/api/organizations/${orgId}/chat_conversations`, {
      method: 'POST',
      headers: {
        Cookie: `sessionKey=${credential}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({ name: '' }),
    })
    if (!res.ok) throw Object.assign(new Error('claude conv create failed'), { status: res.status })
    const conv = await res.json() as { uuid: string }
    return conv.uuid
  }

  private extractText(msg: Message): string {
    return typeof msg.content === 'string'
      ? msg.content
      : msg.content.filter(b => b.type === 'text').map(b => (b as any).text as string).join('')
  }

  async *sendMessage(request: NormalizedRequest, account: Account): AsyncIterable<string> {
    const orgId = await this.getOrgId(account.credential)
    const convId = await this.createConversation(orgId, account.credential)

    const prompt = request.messages.map(m =>
      `\n\nHuman: ${this.extractText(m)}\n\nAssistant:`
    ).join('')

    const res = await fetch(
      `https://claude.ai/api/organizations/${orgId}/chat_conversations/${convId}/completion`,
      {
        method: 'POST',
        headers: {
          Cookie: `sessionKey=${account.credential}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'User-Agent': 'Mozilla/5.0',
        },
        body: JSON.stringify({ prompt, timezone: 'UTC', attachments: [], files: [] }),
      }
    )
    if (!res.ok) throw Object.assign(new Error('claude completion failed'), { status: res.status })
    if (!res.body) throw new Error('no response body')

    yield* parseSSEStream(res.body, (data) => {
      try {
        const parsed = JSON.parse(data)
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          return parsed.delta.text as string
        }
      } catch { /* ignore */ }
      return null
    })
  }

  isQuotaError(status: number): boolean { return status === 429 }
  isAuthError(status: number): boolean { return status === 401 || status === 403 }
}
