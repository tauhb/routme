import type { Provider, NormalizedRequest, Account, Message } from '../types.js'
import { parseSSEStream } from '../utils/sse.js'
import { browserHeaders } from '../utils/headers.js'

const ORIGIN = 'https://claude.ai'

const claudeHeaders = (credential: string, extra?: Record<string, string>) => ({
  ...browserHeaders(ORIGIN, {
    'Cookie': `sessionKey=${credential}`,
    'anthropic-client-version': 'claude.ai/web',
    ...extra,
  }),
})

export class ClaudeProvider implements Provider {
  readonly id = 'claude' as const

  private async getOrgId(credential: string): Promise<string> {
    const res = await fetch(`${ORIGIN}/api/organizations`, {
      headers: claudeHeaders(credential, { Accept: 'application/json' }),
    })
    if (!res.ok) throw Object.assign(new Error('claude org fetch failed'), { status: res.status })
    const orgs = await res.json() as Array<{ uuid: string }>
    return orgs[0].uuid
  }

  private async createConversation(orgId: string, credential: string): Promise<string> {
    const res = await fetch(`${ORIGIN}/api/organizations/${orgId}/chat_conversations`, {
      method: 'POST',
      headers: claudeHeaders(credential, { 'Content-Type': 'application/json' }),
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

    const messages = request.messages.map(m => ({
      role: m.role,
      content: [{ type: 'text', text: this.extractText(m) }],
    }))

    const body: Record<string, unknown> = {
      messages,
      timezone: 'UTC',
      attachments: [],
      files: [],
      rendering_mode: 'raw',
    }
    if (request.system) {
      body.system = [{ type: 'text', text: request.system }]
    }

    const res = await fetch(
      `${ORIGIN}/api/organizations/${orgId}/chat_conversations/${convId}/completion`,
      {
        method: 'POST',
        headers: claudeHeaders(account.credential, {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        }),
        body: JSON.stringify(body),
      }
    )
    if (!res.ok) {
      const errBody = await res.text()
      throw Object.assign(new Error('claude error'), { status: res.status, body: errBody })
    }
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
  isAuthError(status: number): boolean { return status === 401 || status === 403 || status === 404 }
}
