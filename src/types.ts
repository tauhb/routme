export type ProviderId = 'claude' | 'gemini' | 'chatgpt' | 'deepseek' | 'kimi'
export type AccountStatus = 'active' | 'rate_limited' | 'expired' | 'disabled'

export interface Account {
  id: string
  provider: ProviderId
  label: string
  credential: string
  status: AccountStatus
  rateLimitedUntil: string | null
  lastUsed: string | null
  addedAt: string
}

export interface TextContent { type: 'text'; text: string }
export interface ImageContent {
  type: 'image'
  source: { type: 'base64'; media_type: string; data: string }
}
export type ContentBlock = TextContent | ImageContent

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
}

export interface NormalizedRequest {
  messages: Message[]
  model: string
  system?: string
  stream: boolean
  maxTokens?: number
  temperature?: number
}

export interface Provider {
  id: ProviderId
  sendMessage(request: NormalizedRequest, account: Account): AsyncIterable<string>
  isQuotaError(status: number, body: string): boolean
  isAuthError(status: number, body: string): boolean
  quotaCooldown?(status: number, body: string): number  // minutes; if absent uses global config
}

export interface RequestLog {
  id: string
  timestamp: string
  provider: string
  accountId: string
  accountLabel: string
  status: 'success' | 'error'
  latencyMs: number
  error?: string
}
