import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { config } from './config.js'

const app = new Hono()

app.get('/health', (c) => c.json({ status: 'ok' }))

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`RoutMe running on port ${config.port}`)
})

export { app }
