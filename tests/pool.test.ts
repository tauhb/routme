import { describe, it, expect, vi } from 'vitest'
import { createPool } from '../src/pool.js'
import type { Storage } from '../src/storage.js'
import type { Account } from '../src/types.js'

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1', provider: 'claude', label: 'Test', credential: 'cookie',
    status: 'active', rateLimitedUntil: null, lastUsed: null,
    addedAt: '2026-06-05T00:00:00Z', ...overrides,
  }
}

function makeStorage(accounts: Account[]) {
  return {
    readAccounts: vi.fn().mockResolvedValue(accounts),
    writeAccounts: vi.fn().mockResolvedValue(undefined),
    readLogs: vi.fn(),
    appendLog: vi.fn(),
  } as unknown as Storage
}

describe('pick', () => {
  it('returns null when no accounts', async () => {
    const pool = createPool(makeStorage([]), 30)
    expect(await pool.pick('claude')).toBeNull()
  })

  it('returns active account', async () => {
    const pool = createPool(makeStorage([makeAccount()]), 30)
    expect((await pool.pick('claude'))?.id).toBe('acc-1')
  })

  it('skips disabled account', async () => {
    const pool = createPool(makeStorage([makeAccount({ status: 'disabled' })]), 30)
    expect(await pool.pick('claude')).toBeNull()
  })

  it('skips rate_limited account within cooldown', async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    const pool = createPool(makeStorage([makeAccount({ status: 'rate_limited', rateLimitedUntil: future })]), 30)
    expect(await pool.pick('claude')).toBeNull()
  })

  it('auto-recovers expired cooldown', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const storage = makeStorage([makeAccount({ status: 'rate_limited', rateLimitedUntil: past })])
    const pool = createPool(storage, 30)
    const result = await pool.pick('claude')
    expect(result?.status).toBe('active')
    expect(storage.writeAccounts).toHaveBeenCalled()
  })

  it('round-robins across multiple accounts', async () => {
    const storage = makeStorage([makeAccount({ id: 'acc-1' }), makeAccount({ id: 'acc-2' })])
    const pool = createPool(storage, 30)
    expect((await pool.pick('claude'))?.id).toBe('acc-1')
    expect((await pool.pick('claude'))?.id).toBe('acc-2')
    expect((await pool.pick('claude'))?.id).toBe('acc-1')
  })
})

describe('markRateLimited', () => {
  it('sets status and expiry', async () => {
    let saved: Account[] = []
    const storage = makeStorage([makeAccount()])
    vi.mocked(storage.writeAccounts).mockImplementation(async (accs) => { saved = accs })
    const pool = createPool(storage, 30)
    await pool.markRateLimited('acc-1')
    expect(saved[0].status).toBe('rate_limited')
    expect(saved[0].rateLimitedUntil).not.toBeNull()
  })
})

describe('markExpired', () => {
  it('sets status to expired', async () => {
    let saved: Account[] = []
    const storage = makeStorage([makeAccount()])
    vi.mocked(storage.writeAccounts).mockImplementation(async (accs) => { saved = accs })
    const pool = createPool(storage, 30)
    await pool.markExpired('acc-1')
    expect(saved[0].status).toBe('expired')
  })
})
