function envInt(key: string, fallback: number): number {
  const val = parseInt(process.env[key] ?? String(fallback))
  return isNaN(val) ? fallback : val
}

export const config = {
  port: envInt('PORT', 3000),
  apiKey: process.env.API_KEY ?? 'change-me',
  dashboardPassword: process.env.DASHBOARD_PASSWORD ?? 'admin',
  rateLimitCooldown: envInt('RATE_LIMIT_COOLDOWN', 30),
  dataDir: process.env.DATA_DIR ?? './data',
}
