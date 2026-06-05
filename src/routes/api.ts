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

  return router
}
