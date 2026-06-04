import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { createStorage } from '../src/storage.js'

let tmpDir: string
let storage: ReturnType<typeof createStorage>

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'routme-test-'))
  await writeFile(join(tmpDir, 'accounts.json'), JSON.stringify({ accounts: [] }))
  await writeFile(join(tmpDir, 'logs.json'), JSON.stringify({ logs: [] }))
  storage = createStorage(tmpDir)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true })
})

describe('accounts', () => {
  it('reads empty accounts list', async () => {
    expect(await storage.readAccounts()).toEqual([])
  })

  it('writes and reads back accounts', async () => {
    const account = {
      id: 'test-id', provider: 'claude' as const, label: 'Test',
      credential: 'cookie123', status: 'active' as const,
      rateLimitedUntil: null, lastUsed: null, addedAt: '2026-06-05T00:00:00Z',
    }
    await storage.writeAccounts([account])
    expect(await storage.readAccounts()).toEqual([account])
  })
})

describe('logs', () => {
  it('appends a log entry', async () => {
    const log = {
      id: 'log-1', timestamp: '2026-06-05T00:00:00Z',
      provider: 'claude', accountId: 'acc-1', accountLabel: 'Test',
      status: 'success' as const, latencyMs: 500,
    }
    await storage.appendLog(log)
    expect(await storage.readLogs()).toEqual([log])
  })

  it('keeps only the last 100 logs', async () => {
    for (let i = 0; i < 105; i++) {
      await storage.appendLog({
        id: `log-${i}`, timestamp: '2026-06-05T00:00:00Z',
        provider: 'claude', accountId: 'acc-1', accountLabel: 'Test',
        status: 'success', latencyMs: 10,
      })
    }
    expect((await storage.readLogs()).length).toBe(100)
  })
})
