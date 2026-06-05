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
