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
