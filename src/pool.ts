import type { Storage } from './storage.js'
import type { Account, ProviderId } from './types.js'

export function createPool(storage: Storage, cooldownMinutes: number) {
  const counters = new Map<string, number>()

  async function pick(providerId: ProviderId): Promise<Account | null> {
    const accounts = await storage.readAccounts()
    const now = Date.now()
    const recovered: Account[] = []
    const eligible: Account[] = []

    for (const a of accounts) {
      if (a.provider !== providerId) continue
      if (a.status === 'disabled' || a.status === 'expired') continue
      if (a.status === 'rate_limited') {
        if (a.rateLimitedUntil && new Date(a.rateLimitedUntil).getTime() <= now) {
          a.status = 'active'
          a.rateLimitedUntil = null
          recovered.push(a)
          eligible.push(a)
        }
        continue
      }
      eligible.push(a)
    }

    if (recovered.length > 0) await storage.writeAccounts(accounts)
    if (eligible.length === 0) return null

    const idx = (counters.get(providerId) ?? 0) % eligible.length
    counters.set(providerId, idx + 1)
    return eligible[idx]
  }

  async function markRateLimited(accountId: string, overrideMinutes?: number): Promise<void> {
    const minutes = overrideMinutes ?? cooldownMinutes
    const accounts = await storage.readAccounts()
    const account = accounts.find(a => a.id === accountId)
    if (!account) return
    account.status = 'rate_limited'
    account.rateLimitedUntil = new Date(Date.now() + minutes * 60_000).toISOString()
    await storage.writeAccounts(accounts)
  }

  async function markExpired(accountId: string): Promise<void> {
    const accounts = await storage.readAccounts()
    const account = accounts.find(a => a.id === accountId)
    if (!account) return
    account.status = 'expired'
    account.rateLimitedUntil = null
    await storage.writeAccounts(accounts)
  }

  async function updateLastUsed(accountId: string): Promise<void> {
    const accounts = await storage.readAccounts()
    const account = accounts.find(a => a.id === accountId)
    if (!account) return
    account.lastUsed = new Date().toISOString()
    await storage.writeAccounts(accounts)
  }

  return { pick, markRateLimited, markExpired, updateLastUsed }
}

export type Pool = ReturnType<typeof createPool>
