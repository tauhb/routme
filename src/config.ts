export const config = {
  port: parseInt(process.env.PORT ?? '3000'),
  apiKey: process.env.API_KEY ?? 'change-me',
  dashboardPassword: process.env.DASHBOARD_PASSWORD ?? 'admin',
  rateLimitCooldown: parseInt(process.env.RATE_LIMIT_COOLDOWN ?? '30'),
  dataDir: process.env.DATA_DIR ?? './data',
}
