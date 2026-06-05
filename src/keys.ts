import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { config } from './config.js'

export interface ApiKey {
  id: string
  key: string
  label: string
  enabled: boolean
  createdAt: string
}

const keysPath = () => join(config.dataDir, 'keys.json')

export async function readKeys(): Promise<ApiKey[]> {
  try {
    const raw = await readFile(keysPath(), 'utf-8')
    return JSON.parse(raw).keys
  } catch {
    return []
  }
}

async function writeKeys(keys: ApiKey[]): Promise<void> {
  await writeFile(keysPath(), JSON.stringify({ keys }, null, 2))
}

export function generateKey(): string {
  return 'rm-' + randomBytes(16).toString('hex')
}

export async function createKey(label: string): Promise<ApiKey> {
  const keys = await readKeys()
  const newKey: ApiKey = {
    id: crypto.randomUUID(),
    key: generateKey(),
    label,
    enabled: true,
    createdAt: new Date().toISOString(),
  }
  await writeKeys([...keys, newKey])
  return newKey
}

export async function updateKey(id: string, patch: Partial<Pick<ApiKey, 'label' | 'enabled'>>): Promise<ApiKey | null> {
  const keys = await readKeys()
  const idx = keys.findIndex(k => k.id === id)
  if (idx === -1) return null
  keys[idx] = { ...keys[idx], ...patch }
  await writeKeys(keys)
  return keys[idx]
}

export async function deleteKey(id: string): Promise<boolean> {
  const keys = await readKeys()
  const filtered = keys.filter(k => k.id !== id)
  if (filtered.length === keys.length) return false
  await writeKeys(filtered)
  return true
}

export async function isValidClientKey(key: string): Promise<boolean> {
  if (!key.startsWith('rm-')) return false
  const keys = await readKeys()
  return keys.some(k => k.key === key && k.enabled)
}
