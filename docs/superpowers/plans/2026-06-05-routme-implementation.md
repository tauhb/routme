# RoutMe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted LLM routing proxy that round-robins free consumer accounts across Claude.ai, Gemini, ChatGPT, DeepSeek, and Kimi to avoid quota errors, exposed as both Anthropic-compatible and OpenAI-compatible API endpoints.

**Architecture:** Hono server on port 3000 handles both API and dashboard. An AccountPool selects the next available account per provider and falls back across providers if all fail. A FormatTranslator normalizes incoming Anthropic/OpenAI requests to an internal format and converts responses back. Provider adapters call each service's API (official free-tier or unofficial browser session) and yield text as async iterables.

**Tech Stack:** Node.js 22, Hono 4, TypeScript 5, Vitest 3, JSON file storage (no database)

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/server.ts` | Hono app entry, middleware, route registration |
| `src/config.ts` | Load `.env` variables |
| `src/types.ts` | All shared TypeScript interfaces |
| `src/storage.ts` | Read/write `data/accounts.json` and `data/logs.json` |
| `src/pool.ts` | Account round-robin selection, status updates |
| `src/translator.ts` | Detect format, normalize request, format SSE chunks |
| `src/providers/index.ts` | Provider registry (id → Provider instance) |
| `src/providers/claude.ts` | Claude.ai unofficial API adapter |
| `src/providers/gemini.ts` | Google Gemini free API adapter |
| `src/providers/chatgpt.ts` | ChatGPT unofficial API adapter |
| `src/providers/deepseek.ts` | DeepSeek free API adapter |
| `src/providers/kimi.ts` | Kimi unofficial API adapter |
| `src/routes/api.ts` | `/v1/messages` + `/v1/chat/completions` handlers |
| `src/routes/dashboard.ts` | Dashboard HTML + `/api/*` CRUD |
| `src/dashboard/index.html` | Dashboard SPA (plain HTML) |
| `src/dashboard/app.js` | Dashboard frontend JS |
| `tests/storage.test.ts` | Storage layer unit tests |
| `tests/pool.test.ts` | Account pool unit tests |
| `tests/translator.test.ts` | Format translator unit tests |
| `tests/providers/claude.test.ts` | Claude adapter unit tests |
| `tests/providers/gemini.test.ts` | Gemini adapter unit tests |
| `tests/providers/chatgpt.test.ts` | ChatGPT adapter unit tests |
| `tests/providers/deepseek.test.ts` | DeepSeek adapter unit tests |
| `tests/providers/kimi.test.ts` | Kimi adapter unit tests |
| `.env.example` | Environment variable template |
| `Dockerfile` | Container build |
| `docker-compose.yml` | Compose config with data/ volume |
| `.dockerignore` | Docker build exclusions |

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `src/server.ts`
- Create: `src/config.ts`
- Create: `data/accounts.json`
- Create: `data/logs.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "routme",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hono/node-server": "^1.14.0",
    "hono": "^4.7.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node' }
})
```

- [ ] **Step 4: Create .env.example**

```
PORT=3000
API_KEY=change-me
DASHBOARD_PASSWORD=admin
RATE_LIMIT_COOLDOWN=30
DATA_DIR=./data
```

- [ ] **Step 5: Initialize data files**

Create `data/accounts.json`:
```json
{ "accounts": [] }
```

Create `data/logs.json`:
```json
{ "logs": [] }
```

- [ ] **Step 6: Create src/config.ts**

```typescript
export const config = {
  port: parseInt(process.env.PORT ?? '3000'),
  apiKey: process.env.API_KEY ?? 'change-me',
  dashboardPassword: process.env.DASHBOARD_PASSWORD ?? 'admin',
  rateLimitCooldown: parseInt(process.env.RATE_LIMIT_COOLDOWN ?? '30'),
  dataDir: process.env.DATA_DIR ?? './data',
}
```

- [ ] **Step 7: Create src/server.ts**

```typescript
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { config } from './config.js'

const app = new Hono()

app.get('/health', (c) => c.json({ status: 'ok' }))

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`RoutMe running on port ${config.port}`)
})

export { app }
```

- [ ] **Step 8: Install and verify**

```bash
npm install
npm run dev
# Expected: "RoutMe running on port 3000"
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

- [ ] **Step 9: Commit**

```bash
git init
git add .
git commit -m "feat: project scaffold with Hono server"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create src/types.ts**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: shared TypeScript types"
```

---

## Task 3: Storage layer

**Files:**
- Create: `src/storage.ts`
- Create: `tests/storage.test.ts`

- [ ] **Step 1: Write failing tests in tests/storage.test.ts**

```typescript
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/storage.test.ts
# Expected: FAIL — "Cannot find module '../src/storage.js'"
```

- [ ] **Step 3: Implement src/storage.ts**

```typescript
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
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- tests/storage.test.ts
# Expected: PASS — 4 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add src/storage.ts tests/storage.test.ts
git commit -m "feat: JSON file storage layer with tests"
```

---

## Task 4: Account Pool

**Files:**
- Create: `src/pool.ts`
- Create: `tests/pool.test.ts`

- [ ] **Step 1: Write failing tests in tests/pool.test.ts**

```typescript
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/pool.test.ts
# Expected: FAIL — "Cannot find module '../src/pool.js'"
```

- [ ] **Step 3: Implement src/pool.ts**

```typescript
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

  async function markRateLimited(accountId: string): Promise<void> {
    const accounts = await storage.readAccounts()
    const account = accounts.find(a => a.id === accountId)
    if (!account) return
    account.status = 'rate_limited'
    account.rateLimitedUntil = new Date(Date.now() + cooldownMinutes * 60_000).toISOString()
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
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- tests/pool.test.ts
# Expected: PASS — 8 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add src/pool.ts tests/pool.test.ts
git commit -m "feat: account pool with round-robin and auto-recovery"
```

---

## Task 5: Format Translator

**Files:**
- Create: `src/translator.ts`
- Create: `tests/translator.test.ts`

- [ ] **Step 1: Write failing tests in tests/translator.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import {
  detectFormat, normalizeRequest,
  formatAnthropicChunk, formatAnthropicDone,
  formatOpenAIChunk, formatOpenAIDone,
} from '../src/translator.js'

describe('detectFormat', () => {
  it('detects anthropic by path', () => {
    expect(detectFormat('/v1/messages', {})).toBe('anthropic')
  })
  it('detects openai by path', () => {
    expect(detectFormat('/v1/chat/completions', {})).toBe('openai')
  })
  it('detects anthropic by header', () => {
    expect(detectFormat('/v1/chat/completions', { 'anthropic-version': '2023-06-01' })).toBe('anthropic')
  })
})

describe('normalizeRequest', () => {
  it('normalizes anthropic format', () => {
    const result = normalizeRequest(
      { model: 'claude-3-5-sonnet', messages: [{ role: 'user', content: 'Hello' }], system: 'Be helpful', max_tokens: 1024, stream: true },
      'anthropic'
    )
    expect(result).toEqual({ model: 'claude-3-5-sonnet', messages: [{ role: 'user', content: 'Hello' }], system: 'Be helpful', maxTokens: 1024, stream: true, temperature: undefined })
  })

  it('normalizes openai format and extracts system message', () => {
    const result = normalizeRequest(
      { model: 'gpt-4o', messages: [{ role: 'system', content: 'Be helpful' }, { role: 'user', content: 'Hello' }], stream: false },
      'openai'
    )
    expect(result.system).toBe('Be helpful')
    expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }])
    expect(result.stream).toBe(false)
  })
})

describe('formatAnthropicChunk', () => {
  it('formats as Anthropic SSE delta', () => {
    expect(formatAnthropicChunk('Hello')).toBe(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n'
    )
  })
})

describe('formatOpenAIChunk', () => {
  it('contains the text in choices delta', () => {
    const line = formatOpenAIChunk('Hello', 'gpt-4o')
    const parsed = JSON.parse(line.replace('data: ', '').trim())
    expect(parsed.choices[0].delta.content).toBe('Hello')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/translator.test.ts
# Expected: FAIL
```

- [ ] **Step 3: Implement src/translator.ts**

```typescript
import type { NormalizedRequest, Message } from './types.js'

export function detectFormat(
  path: string,
  headers: Record<string, string>
): 'anthropic' | 'openai' {
  if (path.includes('/v1/messages')) return 'anthropic'
  if (headers['anthropic-version']) return 'anthropic'
  return 'openai'
}

export function normalizeRequest(body: any, format: 'anthropic' | 'openai'): NormalizedRequest {
  if (format === 'anthropic') {
    return {
      model: body.model,
      messages: body.messages,
      system: body.system,
      stream: body.stream ?? false,
      maxTokens: body.max_tokens,
      temperature: body.temperature,
    }
  }
  const messages: Message[] = body.messages ?? []
  const sysMsg = messages.find((m: Message) => m.role === 'system')
  return {
    model: body.model,
    messages: messages.filter((m: Message) => m.role !== 'system'),
    system: typeof sysMsg?.content === 'string' ? sysMsg.content : undefined,
    stream: body.stream ?? false,
    maxTokens: body.max_tokens,
    temperature: body.temperature,
  }
}

export function formatAnthropicChunk(text: string): string {
  return `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`
}

export function formatAnthropicDone(): string {
  return `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`
}

export function formatOpenAIChunk(text: string, model: string): string {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-routme', object: 'chat.completion.chunk', model,
    choices: [{ delta: { content: text }, index: 0, finish_reason: null }],
  })}\n\n`
}

export function formatOpenAIDone(): string {
  return 'data: [DONE]\n\n'
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- tests/translator.test.ts
# Expected: PASS — 5 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add src/translator.ts tests/translator.test.ts
git commit -m "feat: format translator for Anthropic/OpenAI with tests"
```

---

## Task 6: SSE utility + Provider registry

**Files:**
- Create: `src/utils/sse.ts`
- Create: `src/providers/index.ts`

- [ ] **Step 1: Create src/utils/sse.ts** (shared SSE parser used by all adapters)

```typescript
export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
  extract: (eventData: string) => string | null
): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const text = extract(line.slice(6))
      if (text !== null) yield text
    }
  }
}

export async function* parseOpenAISSE(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  yield* parseSSEStream(body, (data) => {
    if (data === '[DONE]') return null
    try {
      const parsed = JSON.parse(data)
      return parsed.choices?.[0]?.delta?.content ?? null
    } catch { return null }
  })
}
```

- [ ] **Step 2: Create src/providers/index.ts**

```typescript
import type { Provider, ProviderId } from '../types.js'
import { ClaudeProvider } from './claude.js'
import { GeminiProvider } from './gemini.js'
import { ChatGPTProvider } from './chatgpt.js'
import { DeepSeekProvider } from './deepseek.js'
import { KimiProvider } from './kimi.js'

const registry = new Map<ProviderId, Provider>([
  ['claude', new ClaudeProvider()],
  ['gemini', new GeminiProvider()],
  ['chatgpt', new ChatGPTProvider()],
  ['deepseek', new DeepSeekProvider()],
  ['kimi', new KimiProvider()],
])

export function getProvider(id: ProviderId): Provider | undefined {
  return registry.get(id)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/sse.ts src/providers/index.ts
git commit -m "feat: SSE utility and provider registry"
```

---

## Task 7: Claude adapter

**Files:**
- Create: `src/providers/claude.ts`
- Create: `tests/providers/claude.test.ts`

The `credential` field holds the `sessionKey` cookie value from claude.ai.
**How to get it:** Open claude.ai → DevTools (F12) → Application → Cookies → copy the `sessionKey` value.

- [ ] **Step 1: Write failing tests in tests/providers/claude.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { ClaudeProvider } from '../../src/providers/claude.js'
import type { Account, NormalizedRequest } from '../../src/types.js'

const mockAccount: Account = {
  id: 'acc-1', provider: 'claude', label: 'Test', credential: 'session-key-xxx',
  status: 'active', rateLimitedUntil: null, lastUsed: null, addedAt: '2026-06-05T00:00:00Z',
}
const mockRequest: NormalizedRequest = {
  model: 'claude-3-5-sonnet', messages: [{ role: 'user', content: 'Hello' }], stream: true,
}

describe('ClaudeProvider', () => {
  it('isQuotaError detects 429', () => {
    expect(new ClaudeProvider().isQuotaError(429, '')).toBe(true)
    expect(new ClaudeProvider().isQuotaError(200, '')).toBe(false)
  })

  it('isAuthError detects 401 and 403', () => {
    const p = new ClaudeProvider()
    expect(p.isAuthError(401, '')).toBe(true)
    expect(p.isAuthError(403, '')).toBe(true)
    expect(p.isAuthError(200, '')).toBe(false)
  })

  it('sendMessage yields text chunks from SSE stream', async () => {
    const sseBody = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n')

    const mockStream = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close() },
    })

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ uuid: 'org-1' }]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ uuid: 'conv-1' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, body: mockStream })

    const chunks: string[] = []
    for await (const chunk of new ClaudeProvider().sendMessage(mockRequest, mockAccount)) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['Hello', ' world'])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
mkdir -p tests/providers
npm test -- tests/providers/claude.test.ts
# Expected: FAIL
```

- [ ] **Step 3: Implement src/providers/claude.ts**

```typescript
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
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- tests/providers/claude.test.ts
# Expected: PASS — 3 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add src/providers/claude.ts tests/providers/claude.test.ts
git commit -m "feat: Claude.ai provider adapter"
```

---

## Task 8: Gemini adapter

**Files:**
- Create: `src/providers/gemini.ts`
- Create: `tests/providers/gemini.test.ts`

The `credential` is a free API key from [aistudio.google.com](https://aistudio.google.com) → Get API key (no credit card required).

- [ ] **Step 1: Write failing tests in tests/providers/gemini.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { GeminiProvider } from '../../src/providers/gemini.js'
import type { Account, NormalizedRequest } from '../../src/types.js'

const mockAccount: Account = {
  id: 'acc-1', provider: 'gemini', label: 'Gemini Free', credential: 'AIza-test-key',
  status: 'active', rateLimitedUntil: null, lastUsed: null, addedAt: '2026-06-05T00:00:00Z',
}
const mockRequest: NormalizedRequest = {
  model: 'gemini-2.0-flash', messages: [{ role: 'user', content: 'Hello' }], stream: true,
}

describe('GeminiProvider', () => {
  it('isQuotaError detects 429', () => {
    expect(new GeminiProvider().isQuotaError(429, '')).toBe(true)
  })

  it('isAuthError detects 401 and 403', () => {
    const p = new GeminiProvider()
    expect(p.isAuthError(401, '')).toBe(true)
    expect(p.isAuthError(403, '')).toBe(true)
  })

  it('sendMessage yields text chunks', async () => {
    const sseBody = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}',
      '',
    ].join('\n')
    const mockStream = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close() },
    })
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, body: mockStream })

    const chunks: string[] = []
    for await (const chunk of new GeminiProvider().sendMessage(mockRequest, mockAccount)) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['Hello', ' world'])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/providers/gemini.test.ts
# Expected: FAIL
```

- [ ] **Step 3: Implement src/providers/gemini.ts**

```typescript
import type { Provider, NormalizedRequest, Account, Message } from '../types.js'
import { parseSSEStream } from '../utils/sse.js'

export class GeminiProvider implements Provider {
  readonly id = 'gemini' as const

  private extractText(msg: Message): string {
    return typeof msg.content === 'string'
      ? msg.content
      : msg.content.filter(b => b.type === 'text').map(b => (b as any).text as string).join('')
  }

  async *sendMessage(request: NormalizedRequest, account: Account): AsyncIterable<string> {
    const model = request.model.startsWith('gemini') ? request.model : 'gemini-2.0-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${account.credential}`

    const contents = request.messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: this.extractText(m) }],
    }))

    const body: Record<string, unknown> = { contents }
    if (request.system) body.systemInstruction = { parts: [{ text: request.system }] }
    if (request.maxTokens || request.temperature !== undefined) {
      body.generationConfig = {
        ...(request.maxTokens ? { maxOutputTokens: request.maxTokens } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw Object.assign(new Error('gemini error'), { status: res.status })
    if (!res.body) throw new Error('no response body')

    yield* parseSSEStream(res.body, (data) => {
      try {
        const parsed = JSON.parse(data)
        return parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? null
      } catch { return null }
    })
  }

  isQuotaError(status: number): boolean { return status === 429 }
  isAuthError(status: number): boolean { return status === 401 || status === 403 }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- tests/providers/gemini.test.ts
# Expected: PASS — 3 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add src/providers/gemini.ts tests/providers/gemini.test.ts
git commit -m "feat: Gemini free API adapter"
```

---

## Task 9: DeepSeek adapter

**Files:**
- Create: `src/providers/deepseek.ts`
- Create: `tests/providers/deepseek.test.ts`

The `credential` is a free API key from [platform.deepseek.com](https://platform.deepseek.com) → API Keys. Their API is OpenAI-compatible.

- [ ] **Step 1: Write failing tests in tests/providers/deepseek.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { DeepSeekProvider } from '../../src/providers/deepseek.js'
import type { Account, NormalizedRequest } from '../../src/types.js'

const mockAccount: Account = {
  id: 'acc-1', provider: 'deepseek', label: 'DeepSeek Free', credential: 'sk-test',
  status: 'active', rateLimitedUntil: null, lastUsed: null, addedAt: '2026-06-05T00:00:00Z',
}
const mockRequest: NormalizedRequest = {
  model: 'deepseek-chat', messages: [{ role: 'user', content: 'Hello' }], stream: true,
}

describe('DeepSeekProvider', () => {
  it('isQuotaError detects 429', () => {
    expect(new DeepSeekProvider().isQuotaError(429, '')).toBe(true)
  })

  it('isAuthError detects 401', () => {
    expect(new DeepSeekProvider().isAuthError(401, '')).toBe(true)
  })

  it('sendMessage yields text from OpenAI-format SSE', async () => {
    const sseBody = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      'data: [DONE]',
      '',
    ].join('\n')
    const mockStream = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close() },
    })
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, body: mockStream })

    const chunks: string[] = []
    for await (const chunk of new DeepSeekProvider().sendMessage(mockRequest, mockAccount)) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['Hello', ' world'])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/providers/deepseek.test.ts
# Expected: FAIL
```

- [ ] **Step 3: Implement src/providers/deepseek.ts**

```typescript
import type { Provider, NormalizedRequest, Account } from '../types.js'
import { parseOpenAISSE } from '../utils/sse.js'

export class DeepSeekProvider implements Provider {
  readonly id = 'deepseek' as const

  async *sendMessage(request: NormalizedRequest, account: Account): AsyncIterable<string> {
    const messages = [
      ...(request.system ? [{ role: 'system', content: request.system }] : []),
      ...request.messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content.filter(b => b.type === 'text').map(b => (b as any).text).join(''),
      })),
    ]

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        stream: true,
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      }),
    })
    if (!res.ok) throw Object.assign(new Error('deepseek error'), { status: res.status })
    if (!res.body) throw new Error('no response body')
    yield* parseOpenAISSE(res.body)
  }

  isQuotaError(status: number): boolean { return status === 429 }
  isAuthError(status: number): boolean { return status === 401 || status === 403 }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- tests/providers/deepseek.test.ts
# Expected: PASS — 3 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add src/providers/deepseek.ts tests/providers/deepseek.test.ts
git commit -m "feat: DeepSeek provider adapter"
```

---

## Task 10: ChatGPT adapter

**Files:**
- Create: `src/providers/chatgpt.ts`
- Create: `tests/providers/chatgpt.test.ts`

The `credential` is the access token from chatgpt.com.
**How to get it:** Open chatgpt.com → DevTools → Application → Local Storage → `chatgpt.com` → value of `access_token`. Or visit `https://chatgpt.com/api/auth/session` while logged in and copy the `accessToken` field.

- [ ] **Step 1: Write failing tests in tests/providers/chatgpt.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { ChatGPTProvider } from '../../src/providers/chatgpt.js'
import type { Account, NormalizedRequest } from '../../src/types.js'

const mockAccount: Account = {
  id: 'acc-1', provider: 'chatgpt', label: 'ChatGPT Free', credential: 'eyJhbGciOiJSUzI1NiJ9.test',
  status: 'active', rateLimitedUntil: null, lastUsed: null, addedAt: '2026-06-05T00:00:00Z',
}
const mockRequest: NormalizedRequest = {
  model: 'gpt-4o', messages: [{ role: 'user', content: 'Hello' }], stream: true,
}

describe('ChatGPTProvider', () => {
  it('isQuotaError detects 429', () => {
    expect(new ChatGPTProvider().isQuotaError(429, '')).toBe(true)
  })

  it('isAuthError detects 401 and 403', () => {
    const p = new ChatGPTProvider()
    expect(p.isAuthError(401, '')).toBe(true)
    expect(p.isAuthError(403, '')).toBe(true)
  })

  it('sendMessage yields incremental text chunks', async () => {
    const sseBody = [
      'data: {"message":{"content":{"parts":["Hello"]},"status":"in_progress"}}',
      'data: {"message":{"content":{"parts":["Hello world"]},"status":"finished_successfully"}}',
      'data: [DONE]',
      '',
    ].join('\n')
    const mockStream = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close() },
    })
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, body: mockStream })

    const chunks: string[] = []
    for await (const chunk of new ChatGPTProvider().sendMessage(mockRequest, mockAccount)) {
      chunks.push(chunk)
    }
    // Should yield "Hello" then " world" (incremental, not accumulated)
    expect(chunks.join('')).toBe('Hello world')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/providers/chatgpt.test.ts
# Expected: FAIL
```

- [ ] **Step 3: Implement src/providers/chatgpt.ts**

ChatGPT returns full accumulated text per chunk, not deltas — track previous length to yield only new text.

```typescript
import type { Provider, NormalizedRequest, Account } from '../types.js'
import { randomUUID } from 'crypto'

export class ChatGPTProvider implements Provider {
  readonly id = 'chatgpt' as const

  async *sendMessage(request: NormalizedRequest, account: Account): AsyncIterable<string> {
    const messages = [
      ...(request.system ? [{ id: randomUUID(), role: 'system', content: request.system }] : []),
      ...request.messages.map(m => ({
        id: randomUUID(),
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content.filter(b => b.type === 'text').map(b => (b as any).text).join(''),
      })),
    ]

    const res = await fetch('https://chatgpt.com/backend-api/conversation', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.credential}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        action: 'next',
        messages,
        model: 'gpt-4o',
        parent_message_id: randomUUID(),
        timezone_offset_min: 0,
        history_and_training_disabled: false,
      }),
    })
    if (!res.ok) throw Object.assign(new Error('chatgpt error'), { status: res.status })
    if (!res.body) throw new Error('no response body')

    let prevLength = 0
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
        try {
          const data = JSON.parse(line.slice(6))
          const parts = data?.message?.content?.parts
          if (!Array.isArray(parts)) continue
          const fullText = parts.join('')
          const newText = fullText.slice(prevLength)
          if (newText) yield newText
          prevLength = fullText.length
        } catch { /* ignore */ }
      }
    }
  }

  isQuotaError(status: number): boolean { return status === 429 }
  isAuthError(status: number): boolean { return status === 401 || status === 403 }
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- tests/providers/chatgpt.test.ts
# Expected: PASS — 3 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add src/providers/chatgpt.ts tests/providers/chatgpt.test.ts
git commit -m "feat: ChatGPT unofficial API adapter"
```

---

## Task 11: Kimi adapter

**Files:**
- Create: `src/providers/kimi.ts`
- Create: `tests/providers/kimi.test.ts`

The `credential` is the bearer token from kimi.moonshot.cn.
**How to get it:** Open kimi.moonshot.cn → DevTools → Network tab → click any API request → copy the `Authorization` header value (without the "Bearer " prefix).

- [ ] **Step 1: Write failing tests in tests/providers/kimi.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { KimiProvider } from '../../src/providers/kimi.js'
import type { Account, NormalizedRequest } from '../../src/types.js'

const mockAccount: Account = {
  id: 'acc-1', provider: 'kimi', label: 'Kimi Free', credential: 'eyJ0eXAiOiJKV1QiLCJhbGci',
  status: 'active', rateLimitedUntil: null, lastUsed: null, addedAt: '2026-06-05T00:00:00Z',
}
const mockRequest: NormalizedRequest = {
  model: 'kimi', messages: [{ role: 'user', content: 'Hello' }], stream: true,
}

describe('KimiProvider', () => {
  it('isQuotaError detects 429', () => {
    expect(new KimiProvider().isQuotaError(429, '')).toBe(true)
  })

  it('isAuthError detects 401', () => {
    expect(new KimiProvider().isAuthError(401, '')).toBe(true)
  })

  it('sendMessage yields text from Kimi SSE', async () => {
    const sseBody = [
      'data: {"event":"cmpl","text":"Hello"}',
      'data: {"event":"cmpl","text":" world"}',
      'data: {"event":"all_done"}',
      '',
    ].join('\n')
    const mockStream = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close() },
    })
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'chat-123' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, body: mockStream })

    const chunks: string[] = []
    for await (const chunk of new KimiProvider().sendMessage(mockRequest, mockAccount)) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['Hello', ' world'])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/providers/kimi.test.ts
# Expected: FAIL
```

- [ ] **Step 3: Implement src/providers/kimi.ts**

```typescript
import type { Provider, NormalizedRequest, Account } from '../types.js'
import { parseSSEStream } from '../utils/sse.js'

export class KimiProvider implements Provider {
  readonly id = 'kimi' as const

  private async createChat(credential: string): Promise<string> {
    const res = await fetch('https://kimi.moonshot.cn/api/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
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

    const res = await fetch(`https://kimi.moonshot.cn/api/chat/${chatId}/completion/stream`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, refs: [], user_search: false }),
    })
    if (!res.ok) throw Object.assign(new Error('kimi error'), { status: res.status })
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
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm test -- tests/providers/kimi.test.ts
# Expected: PASS — 3 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add src/providers/kimi.ts tests/providers/kimi.test.ts
git commit -m "feat: Kimi provider adapter"
```

---

## Task 12: API routes

**Files:**
- Create: `src/routes/api.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Create src/routes/api.ts**

```typescript
import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import type { Storage } from '../storage.js'
import type { Pool } from '../pool.js'
import type { ProviderId } from '../types.js'
import { detectFormat, normalizeRequest, formatAnthropicChunk, formatAnthropicDone, formatOpenAIChunk, formatOpenAIDone } from '../translator.js'
import { getProvider } from '../providers/index.js'
import { config } from '../config.js'

const DEFAULT_PRIORITY: ProviderId[] = ['claude', 'gemini', 'deepseek', 'chatgpt', 'kimi']

export function createApiRouter(storage: Storage, pool: Pool) {
  const router = new Hono()

  router.use('*', async (c, next) => {
    const key = (c.req.header('Authorization') ?? '').replace('Bearer ', '').trim()
    if (key !== config.apiKey) return c.json({ error: 'Unauthorized' }, 401)
    await next()
  })

  async function handleCompletion(c: any) {
    const path = c.req.path
    const headers = Object.fromEntries(c.req.raw.headers.entries())
    const format = detectFormat(path, headers)
    const body = await c.req.json()
    const normalized = normalizeRequest(body, format)
    const start = Date.now()

    for (const providerId of DEFAULT_PRIORITY) {
      const account = await pool.pick(providerId)
      if (!account) continue
      const provider = getProvider(providerId)
      if (!provider) continue

      try {
        const providerStream = provider.sendMessage(normalized, account)

        if (normalized.stream) {
          return stream(c, async (s) => {
            c.res.headers.set('Content-Type', 'text/event-stream')
            c.res.headers.set('Cache-Control', 'no-cache')
            try {
              for await (const chunk of providerStream) {
                await s.write(format === 'anthropic' ? formatAnthropicChunk(chunk) : formatOpenAIChunk(chunk, normalized.model))
              }
              await s.write(format === 'anthropic' ? formatAnthropicDone() : formatOpenAIDone())
              await pool.updateLastUsed(account.id)
              await storage.appendLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), provider: providerId, accountId: account.id, accountLabel: account.label, status: 'success', latencyMs: Date.now() - start })
            } catch (err: any) {
              const status = err?.status ?? 500
              if (provider.isQuotaError(status, '')) await pool.markRateLimited(account.id)
              if (provider.isAuthError(status, '')) await pool.markExpired(account.id)
            }
          })
        }

        let fullText = ''
        for await (const chunk of providerStream) fullText += chunk
        await pool.updateLastUsed(account.id)
        await storage.appendLog({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), provider: providerId, accountId: account.id, accountLabel: account.label, status: 'success', latencyMs: Date.now() - start })

        if (format === 'anthropic') {
          return c.json({ type: 'message', role: 'assistant', content: [{ type: 'text', text: fullText }], model: normalized.model, stop_reason: 'end_turn' })
        }
        return c.json({ id: 'chatcmpl-routme', object: 'chat.completion', model: normalized.model, choices: [{ message: { role: 'assistant', content: fullText }, index: 0, finish_reason: 'stop' }] })

      } catch (err: any) {
        const status = err?.status ?? 500
        if (provider.isQuotaError(status, '')) { await pool.markRateLimited(account.id); continue }
        if (provider.isAuthError(status, '')) { await pool.markExpired(account.id); continue }
        if (status >= 500) continue
        return c.json({ error: err.message }, status)
      }
    }

    return c.json({ error: 'No available accounts. Add accounts in the RoutMe dashboard.' }, 503)
  }

  router.post('/v1/messages', handleCompletion)
  router.post('/v1/chat/completions', handleCompletion)

  return router
}
```

- [ ] **Step 2: Update src/server.ts to wire routers**

```typescript
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { config } from './config.js'
import { createStorage } from './storage.js'
import { createPool } from './pool.js'
import { createApiRouter } from './routes/api.js'
import { createDashboardRouter } from './routes/dashboard.js'

const storage = createStorage(config.dataDir)
const pool = createPool(storage, config.rateLimitCooldown)

const app = new Hono()
app.get('/health', (c) => c.json({ status: 'ok' }))
app.route('/', createApiRouter(storage, pool))
app.route('/', createDashboardRouter(storage))

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`RoutMe running on port ${config.port}`)
})

export { app }
```

- [ ] **Step 3: Smoke test**

```bash
npm run dev

curl -s -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.0-flash","messages":[{"role":"user","content":"hi"}]}'
# Expected: {"error":"Unauthorized"}

curl -s -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.0-flash","messages":[{"role":"user","content":"hi"}]}'
# Expected: {"error":"No available accounts..."}
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.ts src/server.ts
git commit -m "feat: /v1/messages and /v1/chat/completions API routes"
```

---

## Task 13: Dashboard routes

**Files:**
- Create: `src/routes/dashboard.ts`

- [ ] **Step 1: Create src/routes/dashboard.ts**

```typescript
import { Hono } from 'hono'
import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { randomUUID } from 'crypto'
import type { Storage } from '../storage.js'
import type { Account, ProviderId } from '../types.js'
import { config } from '../config.js'

const dashboardDir = resolve(process.cwd(), 'src/dashboard')

export function createDashboardRouter(storage: Storage) {
  const router = new Hono()

  // Session auth for /dashboard pages
  router.use('/dashboard*', async (c, next) => {
    const cookie = c.req.header('Cookie') ?? ''
    if (!cookie.includes(`routme_session=${config.dashboardPassword}`) && c.req.path !== '/dashboard/login') {
      return c.redirect('/dashboard/login')
    }
    await next()
  })

  router.get('/dashboard/login', (c) => c.html(`<!DOCTYPE html>
<html><head><title>RoutMe</title></head>
<body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif">
<form method="POST" action="/dashboard/login" style="display:flex;flex-direction:column;gap:12px;width:280px">
  <h2>RoutMe Dashboard</h2>
  <input name="password" type="password" placeholder="Password" style="padding:8px;font-size:16px"/>
  <button type="submit" style="padding:8px;background:#000;color:#fff;border:none;cursor:pointer">Login</button>
</form></body></html>`))

  router.post('/dashboard/login', async (c) => {
    const body = await c.req.parseBody()
    if (body.password !== config.dashboardPassword) {
      return c.html('<p>Wrong password. <a href="/dashboard/login">Try again</a></p>', 401)
    }
    c.header('Set-Cookie', `routme_session=${config.dashboardPassword}; Path=/; HttpOnly`)
    return c.redirect('/dashboard')
  })

  router.get('/dashboard', async (c) => {
    const html = await readFile(resolve(dashboardDir, 'index.html'), 'utf-8')
    return c.html(html)
  })

  router.get('/dashboard/app.js', async (c) => {
    const js = await readFile(resolve(dashboardDir, 'app.js'), 'utf-8')
    c.header('Content-Type', 'application/javascript')
    return c.body(js)
  })

  // Auth for /api/* (session cookie OR API key)
  router.use('/api/*', async (c, next) => {
    const cookie = c.req.header('Cookie') ?? ''
    const key = (c.req.header('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!cookie.includes(`routme_session=${config.dashboardPassword}`) && key !== config.apiKey) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    await next()
  })

  router.get('/api/accounts', async (c) => c.json(await storage.readAccounts()))

  router.post('/api/accounts', async (c) => {
    const body = await c.req.json() as Partial<Account>
    if (!body.provider || !body.label || !body.credential) {
      return c.json({ error: 'provider, label, and credential are required' }, 400)
    }
    const accounts = await storage.readAccounts()
    const newAccount: Account = {
      id: randomUUID(), provider: body.provider as ProviderId,
      label: body.label, credential: body.credential,
      status: 'active', rateLimitedUntil: null, lastUsed: null,
      addedAt: new Date().toISOString(),
    }
    await storage.writeAccounts([...accounts, newAccount])
    return c.json(newAccount, 201)
  })

  router.patch('/api/accounts/:id', async (c) => {
    const { id } = c.req.param()
    const body = await c.req.json() as Partial<Account>
    const accounts = await storage.readAccounts()
    const idx = accounts.findIndex(a => a.id === id)
    if (idx === -1) return c.json({ error: 'Not found' }, 404)
    accounts[idx] = { ...accounts[idx], ...body, id }
    await storage.writeAccounts(accounts)
    return c.json(accounts[idx])
  })

  router.delete('/api/accounts/:id', async (c) => {
    const { id } = c.req.param()
    const accounts = await storage.readAccounts()
    const filtered = accounts.filter(a => a.id !== id)
    if (filtered.length === accounts.length) return c.json({ error: 'Not found' }, 404)
    await storage.writeAccounts(filtered)
    return c.json({ ok: true })
  })

  router.get('/api/status', async (c) => {
    const accounts = await storage.readAccounts()
    return c.json(accounts.map(({ id, provider, label, status, lastUsed, rateLimitedUntil }) =>
      ({ id, provider, label, status, lastUsed, rateLimitedUntil })
    ))
  })

  router.get('/api/logs', async (c) => {
    const logs = await storage.readLogs()
    return c.json([...logs].reverse())
  })

  return router
}
```

- [ ] **Step 2: Smoke test dashboard routes**

```bash
npm run dev

# Add an account via API key
curl -s -X POST http://localhost:3000/api/accounts \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{"provider":"gemini","label":"Test","credential":"AIza-test"}' | jq .
# Expected: account object with generated id

# List accounts
curl -s http://localhost:3000/api/accounts \
  -H "Authorization: Bearer change-me" | jq .
# Expected: array with 1 account
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/dashboard.ts
git commit -m "feat: dashboard API routes and session auth"
```

---

## Task 14: Dashboard UI

**Files:**
- Create: `src/dashboard/index.html`
- Create: `src/dashboard/app.js`

- [ ] **Step 1: Create src/dashboard/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RoutMe Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #111; }
    nav { background: #000; color: #fff; padding: 12px 24px; display: flex; gap: 24px; align-items: center; }
    nav strong { margin-right: 8px; }
    nav a { color: #fff; text-decoration: none; opacity: 0.6; font-size: 14px; }
    nav a.active, nav a:hover { opacity: 1; }
    main { padding: 24px; max-width: 960px; margin: 0 auto; }
    .card { background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    h3 { font-size: 15px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid #f0f0f0; }
    th { font-size: 11px; text-transform: uppercase; color: #999; letter-spacing: .05em; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 500; }
    .badge.active    { background: #d1fae5; color: #065f46; }
    .badge.rate_limited { background: #fef3c7; color: #92400e; }
    .badge.expired   { background: #fee2e2; color: #991b1b; }
    .badge.disabled  { background: #f3f4f6; color: #6b7280; }
    .badge.success   { background: #d1fae5; color: #065f46; }
    .badge.error     { background: #fee2e2; color: #991b1b; }
    button { padding: 6px 14px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .btn-primary { background: #000; color: #fff; }
    .btn-sm { padding: 3px 8px; font-size: 12px; background: #f3f4f6; }
    .btn-danger { background: #fee2e2; color: #991b1b; }
    input, select { padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; width: 100%; }
    .form-row { display: flex; gap: 12px; margin-bottom: 10px; }
    .form-row > * { flex: 1; }
    .hint { font-size: 12px; color: #6b7280; margin-top: 6px; line-height: 1.5; }
    .empty { text-align: center; color: #9ca3af; padding: 32px 0; font-size: 14px; }
    [data-page] { display: none; }
    [data-page].active { display: block; }
  </style>
</head>
<body>
<nav>
  <strong>RoutMe</strong>
  <a href="#" data-nav="accounts" class="active">Accounts</a>
  <a href="#" data-nav="status">Status</a>
  <a href="#" data-nav="logs">Logs</a>
</nav>
<main>
  <div data-page="accounts" class="active">
    <div class="card">
      <h3>Add Account</h3>
      <div class="form-row">
        <select id="add-provider">
          <option value="claude">Claude.ai</option>
          <option value="gemini">Gemini (Google AI Studio)</option>
          <option value="chatgpt">ChatGPT</option>
          <option value="deepseek">DeepSeek</option>
          <option value="kimi">Kimi</option>
        </select>
        <input id="add-label" placeholder="Label (e.g. Claude Account #1)" />
      </div>
      <div style="margin-bottom:14px">
        <input id="add-credential" placeholder="Paste cookie / API key / token here" />
        <p id="add-hint" class="hint"></p>
      </div>
      <button class="btn-primary" onclick="addAccount()">Add Account</button>
    </div>
    <div class="card">
      <h3>Accounts</h3>
      <table>
        <thead><tr><th>Provider</th><th>Label</th><th>Status</th><th>Last Used</th><th>Actions</th></tr></thead>
        <tbody id="accounts-tbody"></tbody>
      </table>
    </div>
  </div>

  <div data-page="status">
    <div class="card">
      <h3>Live Status</h3>
      <table>
        <thead><tr><th>Provider</th><th>Label</th><th>Status</th><th>Rate Limited Until</th><th>Last Used</th></tr></thead>
        <tbody id="status-tbody"></tbody>
      </table>
    </div>
  </div>

  <div data-page="logs">
    <div class="card">
      <h3>Recent Requests (last 100)</h3>
      <table>
        <thead><tr><th>Time</th><th>Provider</th><th>Account</th><th>Result</th><th>Latency</th></tr></thead>
        <tbody id="logs-tbody"></tbody>
      </table>
    </div>
  </div>
</main>
<script src="/dashboard/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create src/dashboard/app.js**

```javascript
const HINTS = {
  claude:   'Open claude.ai → DevTools (F12) → Application → Cookies → copy the sessionKey value',
  gemini:   'Go to aistudio.google.com → Get API key → Create API key → copy it (starts with AIza...)',
  chatgpt:  'Open chatgpt.com → DevTools → Network → any request → copy Authorization header value (without "Bearer ")',
  deepseek: 'Go to platform.deepseek.com → API Keys → Create key → copy it (starts with sk-...)',
  kimi:     'Open kimi.moonshot.cn → DevTools → Network → any request → copy Authorization header value (without "Bearer ")',
}

const providerEl = document.getElementById('add-provider')
const hintEl = document.getElementById('add-hint')
providerEl.addEventListener('change', () => { hintEl.textContent = HINTS[providerEl.value] ?? '' })
hintEl.textContent = HINTS['claude']

document.querySelectorAll('[data-nav]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault()
    const page = link.dataset.nav
    document.querySelectorAll('[data-nav]').forEach(l => l.classList.remove('active'))
    link.classList.add('active')
    document.querySelectorAll('[data-page]').forEach(el => el.classList.remove('active'))
    document.querySelector(`[data-page="${page}"]`).classList.add('active')
    if (page === 'accounts') loadAccounts()
    if (page === 'status')   loadStatus()
    if (page === 'logs')     loadLogs()
  })
})

async function api(path, options = {}) {
  const res = await fetch(path, options)
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText) }
  return res.json()
}

function fmt(iso) { return iso ? new Date(iso).toLocaleString() : '—' }

async function loadAccounts() {
  const accounts = await api('/api/accounts')
  const tbody = document.getElementById('accounts-tbody')
  tbody.innerHTML = accounts.length === 0
    ? '<tr><td colspan="5" class="empty">No accounts yet. Add one above.</td></tr>'
    : accounts.map(a => `<tr>
        <td>${a.provider}</td>
        <td>${a.label}</td>
        <td><span class="badge ${a.status}">${a.status}</span></td>
        <td>${fmt(a.lastUsed)}</td>
        <td style="display:flex;gap:6px">
          <button class="btn-sm" onclick="toggleAccount('${a.id}','${a.status === 'disabled' ? 'active' : 'disabled'}')">
            ${a.status === 'disabled' ? 'Enable' : 'Disable'}
          </button>
          <button class="btn-sm btn-danger" onclick="deleteAccount('${a.id}')">Delete</button>
        </td>
      </tr>`).join('')
}

async function addAccount() {
  const provider = providerEl.value
  const label = document.getElementById('add-label').value.trim()
  const credential = document.getElementById('add-credential').value.trim()
  if (!label || !credential) return alert('Label and credential are required')
  try {
    await api('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, label, credential }),
    })
    document.getElementById('add-label').value = ''
    document.getElementById('add-credential').value = ''
    await loadAccounts()
  } catch (e) { alert(e.message) }
}

async function toggleAccount(id, newStatus) {
  await api(`/api/accounts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus }),
  })
  await loadAccounts()
}

async function deleteAccount(id) {
  if (!confirm('Delete this account?')) return
  await api(`/api/accounts/${id}`, { method: 'DELETE' })
  await loadAccounts()
}

async function loadStatus() {
  const status = await api('/api/status')
  const tbody = document.getElementById('status-tbody')
  tbody.innerHTML = status.length === 0
    ? '<tr><td colspan="5" class="empty">No accounts.</td></tr>'
    : status.map(a => `<tr>
        <td>${a.provider}</td>
        <td>${a.label}</td>
        <td><span class="badge ${a.status}">${a.status}</span></td>
        <td>${fmt(a.rateLimitedUntil)}</td>
        <td>${fmt(a.lastUsed)}</td>
      </tr>`).join('')
}

async function loadLogs() {
  const logs = await api('/api/logs')
  const tbody = document.getElementById('logs-tbody')
  tbody.innerHTML = logs.length === 0
    ? '<tr><td colspan="5" class="empty">No requests yet.</td></tr>'
    : logs.map(l => `<tr>
        <td>${fmt(l.timestamp)}</td>
        <td>${l.provider}</td>
        <td>${l.accountLabel}</td>
        <td><span class="badge ${l.status}">${l.status}</span></td>
        <td>${l.latencyMs}ms</td>
      </tr>`).join('')
}

loadAccounts()
```

- [ ] **Step 3: Open dashboard and verify**

```bash
npm run dev
open http://localhost:3000/dashboard/login
# Login with password "admin"
# Verify: Accounts tab shows add form, hints update on provider change
# Verify: Status tab loads (may be empty)
# Verify: Logs tab loads (may be empty)
```

- [ ] **Step 4: Commit**

```bash
git add src/dashboard/
git commit -m "feat: dashboard HTML and JS frontend"
```

---

## Task 15: Docker setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY src/dashboard ./src/dashboard
RUN mkdir -p data && \
    echo '{"accounts":[]}' > data/accounts.json && \
    echo '{"logs":[]}' > data/logs.json
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
services:
  routme:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=3000
      - API_KEY=${API_KEY:-change-me}
      - DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD:-admin}
      - RATE_LIMIT_COOLDOWN=${RATE_LIMIT_COOLDOWN:-30}
      - DATA_DIR=/app/data
    restart: unless-stopped
```

- [ ] **Step 3: Create .dockerignore**

```
node_modules
dist
.env
*.test.ts
tests/
```

- [ ] **Step 4: Build and run Docker image**

```bash
npm run build
docker compose up --build -d

curl http://localhost:3000/health
# Expected: {"status":"ok"}

open http://localhost:3000/dashboard/login
```

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: Docker and docker-compose for self-hosted deployment"
```

---

## Task 16: End-to-end smoke test

This task requires a real free account. Use Gemini — easiest to get (no login session tricks needed).

- [ ] **Step 1: Get a free Gemini API key**

Visit https://aistudio.google.com → Get API key → Create API key in new project → copy it.

- [ ] **Step 2: Add account via dashboard**

```
http://localhost:3000/dashboard
Provider: Gemini → Label: "My Gemini" → paste key → Add Account
```

- [ ] **Step 3: Test OpenAI-compatible endpoint (non-streaming)**

```bash
curl -s -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.0-flash","messages":[{"role":"user","content":"Say one word: hello"}],"stream":false}' | jq .choices[0].message.content
# Expected: "Hello" or similar
```

- [ ] **Step 4: Test streaming**

```bash
curl -N -s -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.0-flash","messages":[{"role":"user","content":"Count to 3"}],"stream":true}'
# Expected: multiple "data: {...}" lines followed by "data: [DONE]"
```

- [ ] **Step 5: Test Anthropic-compatible endpoint**

```bash
curl -s -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-5-sonnet","max_tokens":50,"messages":[{"role":"user","content":"Say hello"}],"stream":false}' | jq .content[0].text
# Expected: greeting text (routed through Gemini despite requesting Claude model name)
```

- [ ] **Step 6: Test quota fallback** — add a disabled/expired account, verify requests still succeed via next provider.

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: RoutMe MVP complete"
```

---

## Self-Review Notes

- **Provider API stability**: Claude.ai, ChatGPT, and Kimi use unofficial browser APIs that can change without notice. If an adapter breaks, check DevTools network tab on the provider's website to find the updated endpoints and SSE format.
- **SSE parser duplication**: `parseSSEStream` in `src/utils/sse.ts` is the single shared implementation — all adapters import from there.
- **Provider priority**: Currently hardcoded in `api.ts` as `DEFAULT_PRIORITY`. A future enhancement would persist this in a `settings.json` and expose it via `GET/POST /api/settings`.
- **Dashboard security**: The session cookie uses the plain password as the token value — acceptable for private VPS use, but place behind HTTPS (Nginx/Caddy) before exposing to the internet.
- **ChatGPT free tier limits**: The free tier has aggressive rate limits. Expect frequent 429s and keep multiple accounts in the pool.
