import type { Provider, NormalizedRequest, Account } from '../types.js'

export class GeminiProvider implements Provider {
  readonly id = 'gemini' as const

  async *sendMessage(_request: NormalizedRequest, _account: Account): AsyncIterable<string> {
    yield ''
  }

  isQuotaError(status: number, _body: string): boolean {
    return status === 429
  }

  isAuthError(status: number, _body: string): boolean {
    return status === 401 || status === 403
  }
}
