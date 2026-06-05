import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import type { Storage } from '../storage.js'
import type { Pool } from '../pool.js'
import type { ProviderId } from '../types.js'
import { detectFormat, normalizeRequest, formatAnthropicChunk, formatAnthropicDone, formatOpenAIChunk, formatOpenAIDone } from '../translator.js'
import { getProvider } from '../providers/index.js'
import { config } from '../config.js'
import { isValidClientKey } from '../keys.js'

const DEFAULT_PRIORITY: ProviderId[] = ['claude', 'gemini', 'deepseek', 'chatgpt', 'kimi']

export function createApiRouter(storage: Storage, pool: Pool) {
  const router = new Hono()

  router.use('/v1/*', async (c, next) => {
    const key = (c.req.header('Authorization') ?? '').replace('Bearer ', '').trim()
    if (key === config.apiKey) { await next(); return }
    if (await isValidClientKey(key)) { await next(); return }
    return c.json({ error: 'Unauthorized' }, 401)
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

  router.get('/v1/models', async (c) => {
    const STATIC_MODELS: Record<string, string[]> = {
      claude:   ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
      chatgpt:  ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini'],
      deepseek: ['deepseek-chat', 'deepseek-reasoner'],
      kimi:     ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    }

    const accounts = await storage.readAccounts()
    const activeAccounts = accounts.filter(a => a.status === 'active' || a.status === 'rate_limited')
    const activeProviders = new Set(activeAccounts.map(a => a.provider))

    const modelIds: string[] = []

    // Gemini: fetch live model list from API using first active account
    if (activeProviders.has('gemini')) {
      const geminiAccount = activeAccounts.find(a => a.provider === 'gemini')
      if (geminiAccount) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiAccount.credential}&pageSize=50`
          )
          if (res.ok) {
            const data = await res.json() as { models: Array<{ name: string; supportedGenerationMethods?: string[] }> }
            const geminiModels = (data.models ?? [])
              .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
              .map(m => m.name.replace('models/', ''))
              .filter(id => !id.includes('tts') && !id.includes('image') && !id.startsWith('gemma'))
            modelIds.push(...geminiModels)
          }
        } catch { /* fall through to empty */ }
      }
    }

    // Other providers: use static list
    for (const provider of activeProviders) {
      if (provider === 'gemini') continue
      modelIds.push(...(STATIC_MODELS[provider] ?? []))
    }

    const data = modelIds.map(id => ({
      id,
      object: 'model',
      created: 1700000000,
      owned_by: 'routme',
    }))

    return c.json({ object: 'list', data })
  })

  return router
}
