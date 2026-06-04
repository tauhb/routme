import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Account, RequestLog } from './types.js'

export function createStorage(dataDir: string) {
  const accountsPath = join(dataDir, 'accounts.json')
  const logsPath = join(dataDir, 'logs.json')

  async function readAccounts(): Promise<Account[]> {
    const raw = await readFile(accountsPath, 'utf-8')
    return JSON.parse(raw).accounts
  }

  async function writeAccounts(accounts: Account[]): Promise<void> {
    await writeFile(accountsPath, JSON.stringify({ accounts }, null, 2))
  }

  async function readLogs(): Promise<RequestLog[]> {
    const raw = await readFile(logsPath, 'utf-8')
    return JSON.parse(raw).logs
  }

  async function appendLog(log: RequestLog): Promise<void> {
    const logs = await readLogs()
    logs.push(log)
    await writeFile(logsPath, JSON.stringify({ logs: logs.slice(-100) }, null, 2))
  }

  return { readAccounts, writeAccounts, readLogs, appendLog }
}

export type Storage = ReturnType<typeof createStorage>
