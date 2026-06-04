# RoutMe — Design Spec
Date: 2026-06-05

## Overview

RoutMe is a lightweight self-hosted LLM routing proxy. It pools free consumer accounts from multiple AI providers (Claude.ai, Gemini, ChatGPT, DeepSeek, Kimi, etc.) and routes incoming requests across them to avoid quota errors. Users add accounts by pasting cookies/tokens into a web dashboard. The server exposes both Anthropic-compatible and OpenAI-compatible API endpoints so tools like Claude Code, Cursor, and Cline work without modification.

Target users: developers and AI power users who want to run this on a VPS 24/7 and optionally sell/distribute it to others as a self-hosted product.

---

## Architecture

```
[Tool: Claude Code / Cursor / Cline]
        ↓  HTTP request
[RoutMe Server — port 3000]
        ↓
  Request Router
  - Detect format (Anthropic vs OpenAI)
  - Normalize to internal format
        ↓
  Account Pool
  - Round-robin pick from active accounts
  - Skip rate-limited or expired accounts
  - Auto-fallback to next provider
        ↓
  Provider Adapters
  - claude.ts / gemini.ts / chatgpt.ts / deepseek.ts / kimi.ts
        ↓
  Response Translator
  - Convert provider response back to caller format
  - Support streaming (SSE)
        ↓
[Tool receives response]

[Web Dashboard — /dashboard]
  - Manage accounts (add/remove/enable/disable)
  - View account status & quota state
  - View recent request logs
```

---

## Components

### 1. Server Entry (`src/server.ts`)
- Framework: **Hono** (lightweight, TypeScript-native, runs on Node.js and edge runtimes)
- Single port (3000) serves both API and dashboard
- Middleware: API key auth for `/v1/*` routes, password auth for `/dashboard`
- Config via `.env`

### 2. Provider Adapters (`src/providers/`)
Each provider implements a shared interface:

```ts
interface Provider {
  id: string
  sendMessage(messages: Message[], account: Account): AsyncIterable<Chunk>
  isQuotaError(error: unknown): boolean
}
```

MVP providers: `claude.ts`, `gemini.ts`, `chatgpt.ts`, `deepseek.ts`, `kimi.ts`

Each adapter handles:
- Auth headers / cookie injection
- Unofficial API endpoint for that provider
- Streaming response parsing
- Detecting quota/auth errors from response

### 3. Account Pool (`src/pool.ts`)
- Loads accounts from `data/accounts.json` at startup; watches file for changes
- Per-provider round-robin rotation across active accounts
- On error classification:
  - `rate_limited`: skip account for 30 minutes, auto-recover
  - `expired`: mark as expired, surface warning in dashboard
  - `server_error`: retry once with same account, then skip
- Fallback chain: if all accounts of provider A fail, try provider B in priority order
- Priority order is user-configurable in dashboard (default: Claude → Gemini → DeepSeek → ChatGPT → Kimi)

### 4. Format Translator (`src/translator.ts`)
- Detect incoming request format (Anthropic SDK shape vs OpenAI shape)
- Normalize to internal `Message[]` format
- After provider responds, convert back to the format the caller sent
- Support SSE streaming for both formats
- Handle system prompt, tool use, and image content in translation

### 5. Web Dashboard (`src/dashboard/`)
- Plain HTML + vanilla JS (no build step, no framework)
- Password-protected via session cookie
- Pages:
  - **Accounts**: list all accounts, add new (provider + label + cookie/token), enable/disable, delete. When adding an account, the form shows provider-specific instructions for what to copy from the browser (e.g., "Open Claude.ai → DevTools → Application → Cookies → copy `sessionKey`")
  - **Status**: per-account state (active / rate_limited / expired), last used timestamp
  - **Logs**: last 100 requests (timestamp, provider used, account used, status, latency)
  - **Settings**: provider priority order (drag-and-drop list), rate-limit cooldown duration

### 6. Data Storage (`data/`)
- `accounts.json`: account list with status
- `logs.json`: rolling last 100 request logs (overwrite oldest)
- No database required

**Account schema:**
```json
{
  "id": "uuid",
  "provider": "claude",
  "label": "My Claude Account 1",
  "cookie": "...",
  "status": "active",
  "rateLimitedUntil": null,
  "lastUsed": "2026-06-05T10:00:00Z",
  "addedAt": "2026-06-05T00:00:00Z"
}
```

---

## Error Handling & Fallback

| Error Type | Detection | Action |
|---|---|---|
| 429 Rate limit | HTTP 429 or provider-specific body | Mark `rate_limited` for 30 min, try next account |
| 401/403 Auth fail | HTTP 401/403 | Mark `expired`, skip until user updates cookie |
| 500 Server error | HTTP 5xx | Retry once, then skip account |
| Network timeout | No response in 30s | Retry once with next account |
| All accounts exhausted | Pool returns null | Return 503 with clear error message to caller |

Fallback traversal order:
1. Try all active accounts of the requested provider
2. If all fail, try next provider in priority chain
3. If all providers fail, return error

---

## API Endpoints

### OpenAI-compatible
- `POST /v1/chat/completions` — standard OpenAI chat format, streaming supported

### Anthropic-compatible
- `POST /v1/messages` — Anthropic Messages API format, streaming supported

### Dashboard
- `GET /dashboard` — web UI
- `GET /api/accounts` — list accounts
- `POST /api/accounts` — add account
- `PATCH /api/accounts/:id` — update (enable/disable, update cookie)
- `DELETE /api/accounts/:id` — remove account
- `GET /api/status` — per-account current status
- `GET /api/logs` — recent request logs
- `GET /api/settings` — get settings
- `POST /api/settings` — update settings (priority order, cooldown)

Auth: all `/api/*` and `/dashboard` routes require `Authorization: Bearer <API_KEY>` or session cookie set at dashboard login.

---

## Deployment

### Project structure
```
routme/
├── src/
│   ├── server.ts
│   ├── pool.ts
│   ├── translator.ts
│   ├── providers/
│   │   ├── claude.ts
│   │   ├── gemini.ts
│   │   ├── chatgpt.ts
│   │   ├── deepseek.ts
│   │   └── kimi.ts
│   └── dashboard/
│       ├── index.html
│       └── app.js
├── data/
│   ├── accounts.json
│   └── logs.json
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

### Environment variables
```
PORT=3000
API_KEY=change-me          # Protects /v1/* endpoints
DASHBOARD_PASSWORD=admin   # Protects /dashboard
RATE_LIMIT_COOLDOWN=30     # Minutes before retrying rate-limited account
```

### Running locally
```bash
npm install
npm run dev    # development with watch
npm start      # production
```

### Running on VPS (Docker)
```bash
docker compose up -d
```

`data/` directory is mounted as a volume so accounts and logs persist across container restarts.

### VPS requirements
- Any VPS with 512MB RAM and Docker installed
- Tested targets: DigitalOcean, Hetzner, Vultr
- Access dashboard at `http://your-vps-ip:3000/dashboard`
- Recommend putting behind Nginx + SSL for production

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js 22 | Stable, widely available on VPS |
| Framework | Hono | Lightweight, TypeScript-native, fast |
| Dashboard | Plain HTML/JS | No build step, easy to ship |
| Storage | JSON files | No database install needed, easy backup |
| Container | Docker + Compose | Standard selfhost packaging |
| Language | TypeScript | Type safety for provider adapters |

---

## Out of Scope (MVP)

- MITM proxy / SSL interception (not needed for API-mode usage)
- Token compression (RTK) — add later if needed
- Browser extension for auto-extracting cookies
- Multi-user dashboard with separate account pools
- Cloud sync / remote config
