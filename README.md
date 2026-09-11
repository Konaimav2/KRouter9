<div align="center">
  <img src="./images/krouter9.svg" alt="KRouter9" width="140"/>

  # KRouter9 🔀

  **The AI router that pays for itself. Every feature you wish 9router had, already merged.**

  One local endpoint for Claude Code, Codex, Cursor, Antigravity, Copilot, Cline, OpenCode and 40+ providers — with per-key credit accounting, a circuit breaker, guardrails, semantic caching, and account automation built in. 30 features merged from SRouter, OmniRoute, 9router-v3, and ZenRouter.

  [![GitHub](https://img.shields.io/badge/GitHub-Konaimav2%2FKRouter9-181717?logo=github)](https://github.com/Konaimav2/KRouter9)
  [![npm](https://img.shields.io/badge/npm-krouter9%200.5.78-cb3837?logo=npm)](https://www.npmjs.com/package/krouter9)
  [![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](./LICENSE)
  [![Base](https://img.shields.io/badge/built%20on-9router%20v0.5.69-6366f1?style=flat-square)](https://github.com/decolua/9router)
  [![Node](https://img.shields.io/badge/node-%3E%3D22-339933?style=flat-square&logo=node.js)](https://nodejs.org/)

  [🚀 Quick Start](#-quick-start) • [⚡ What's New](#-whats-added-over-9router) • [📦 Migrate](#-migrate-from-another-router) • [🔌 API](./docs/API-AUTOMATION.md) • [📚 Docs](#-documentation)

</div>

---

## 🤔 Why KRouter9?

**9router is great. It's also missing things you hit the moment you share it with a team:**

- ❌ No way to cap how much a key can spend
- ❌ One dead provider hangs your coding session
- ❌ Logs show a model but never WHICH account served it
- ❌ Secrets in prompts go straight to the upstream provider
- ❌ Migrating means hand-editing databases

**KRouter9 solves this:**

- ✅ **Credit accounting** — every API key carries a USD limit, deducted per request
- ✅ **Circuit breaker** — dead providers cool down and recover on their own
- ✅ **Fallback rules** — "when model X 429s, retry on Y", no code
- ✅ **Guardrails** — mask credentials and PII before they leave your machine
- ✅ **One-command migration** — `krouter9 migrate` moves everything over
- ✅ **Everything 9router has** — combos, OAuth, tunnels, RTK token saver, the whole dashboard

---

## 🔄 How It Works

```
┌─────────────┐
│  Your CLI   │  Claude Code · Codex · Cursor · Cline · OpenCode · Antigravity
└──────┬──────┘
       │  http://localhost:20128/v1
       ▼
┌──────────────────────────────────────────────────┐
│                   KRouter9                        │
│  guardrails → semantic cache → combo/fallback    │
│  → circuit breaker → credit deduction → webhooks │
└──────┬───────────────────────────────────────────┘
       ▼
┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐
│  Antigravity    │ │  Codex          │ │  Kiro / GLM  │  ... 40+ more
│  (OAuth)        │ │  (OAuth)        │ │  (free)      │
└─────────────────┘ └─────────────────┘ └──────────────┘
```

---

## 🚀 Quick Start

**1. Install and start:**

```bash
npm install -g krouter9
krouter9
```

The dashboard opens at `http://localhost:20128`, the API at `http://localhost:20128/v1`.
Default dashboard password is `123456` — change it in Settings.

Prefer from source?

```bash
git clone https://github.com/Konaimav2/KRouter9.git
cd KRouter9
cp .env.example .env
npm install
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

Docker (prebuilt image on ghcr.io):

```bash
docker run -d --name krouter9 --restart unless-stopped \
  -p 20128:20128 \
  -v "$HOME/.krouter9:/app/data" \
  -e DATA_DIR=/app/data \
  ghcr.io/konaimav2/krouter9:latest
```

Or `docker compose up -d`, or build from source — see [DOCKER.md](./DOCKER.md) for the full container guide.

Production mode:

```bash
npm run build
PORT=20128 HOSTNAME=0.0.0.0 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run start
```

**2. Connect a FREE provider (no signup needed):**

Dashboard → Providers → Connect **Kiro AI** (free monthly credits: Claude, GLM, MiniMax) or **OpenCode Free** (no auth) → Done!

**3. Use it in your coding tool:**

```
Claude Code / Codex / Cursor / Cline settings:
  Endpoint: http://localhost:20128/v1
  API Key:  [copy from dashboard]
  Model:    kiro/claude-sonnet-4.5
```

**That's it!** Point Claude Code at it and start coding.

Coming from another router? One command moves your accounts, keys, and combos over — see [📦 Migrate](#-migrate-from-another-router).

---

## ⚡ What's Added Over 9router

Everything below was ported from source and tested against a running instance. Full per-feature docs (config, endpoints, verification steps) in [docs/FEATURES.md](./docs/FEATURES.md).

### From SRouter

- 💰 **Credit accounting per key** — `creditLimit` in USD, `usageCost` deducted as requests are logged, balance and top-ups at `GET/POST /api/keys/:id/credit`
- 🔌 **Circuit breaker** — healthy → cooldown (30s→5min exponential backoff on 429/403) → exhausted after 5 failures, auto-recovers
- 🔀 **Model-level fallback rules** — full CRUD at `/api/settings/fallbacks`: source model, target model, trigger status codes, priority, retries
- 🚦 **Rate limiting + body guard** — fixed-window per key+IP, 25 MB body cap, reusable utilities
- 🏷️ **Pricing dataset** — per-million-token USD lookup for cost math

### From OmniRoute

- 🛡️ **Guardrails** — credential masking (LLM/VCS/payment keys), PII masking, prompt-injection detection. Off by default, fail-open
- ⚡ **Semantic cache** — normalized exact-match with TTL, stored in SQLite
- 📝 **Prompt templates** — CRUD at `/api/prompts`
- 🧠 **Reasoning routing** — tag-in-conversation → model + effort
- 🏊 **Quota pools** — token budgets, allocations, and an append-only ledger
- 🎨 **Media endpoints** — `/v1/rerank` (Cohere), `/v1/moderations` (OpenAI), `/v1/ocr` (Mistral)
- 📡 **models.dev sync** — ranked model catalog, search at `/api/models/smart`

### From 9router-v3

- 🤖 **Account automation** — codebuddy bulk signup jobs, ammail temp-mail OTP with push webhook, Cloudflare Workers AI provisioning
- 🕵️ **AgentRouter WAF-bypass proxy** — UA spoofing, `acw_tc` cookie auto-refresh
- 🖼️ **Media proxy** — CDN proxy with domain allowlist
- 🔑 **QWEN OAuth** (device code + PKCE) and the opencode-go executor

### From ZenRouter

- 🗜️ **RTK filter extensions** — cargoTest, goTest, mypy, pytest, vitest, env, jsonCompact + declarative TOML filters (brew, make, ps, systemctl, terraform)
- 🐛 **Gemini 64-char tool-name fix** (#3622), deferred-tool cache guard (#3567), StreamMode framing fix (#3492)
- 🎭 **thoughtSignature toolCallIds, assistant prefill, client-version/UA spoof registry**
- ⚖️ **Quota-aware account selection** — prefer accounts with remaining quota
- 🔧 **Scheduler lifecycle, request correlation IDs, cgroup-aware CLI memory flags**

### KRouter9 Originals

- 📢 **Webhook dispatcher** — signed events (account_error, quota, credit_low, fallback) to any endpoint
- 📌 **Session affinity** — pin a conversation to one account so multi-turn context stays put
- 🏆 **Model intelligence** — OpenRouter rankings sync, search 150 ranked models
- 🔀 **Slug-qualified combos** — `kiro/my-combo` and `my-combo` both resolve; combo ids never collide with providers

### Donor Rounds (2026-09-07/08)

- 🛡️ **DB integrity gate** — `PRAGMA quick_check` at startup; a corrupted SQLite stops boot before any schema mutation or backup pruning (ZenRouter)
- 🕳️ **Combo first-chunk probe** — a provider that returns 200 then dies mid-stream no longer swallows the request; the combo advances to the next model
- 🌐 **Enforcing CSP** — dashboard + strict API `Content-Security-Policy` headers (ZenRouter)
- 📊 **Request logs: client IP + itemized cost** — unspoofable socket-derived IP and per-request USD cost stored and shown in the logs table
- 📈 **All-time totals** — cumulative requests/tokens/cost summary over any filtered log view
- 🧩 **Translator hardening** — non-array `tool_calls` can no longer crash the cursor/claude/kiro/openai-responses translators (OmniRoute)
- 🖼️ **Antigravity static catalog** — model listing no longer pings the Google endpoint that 403s consumer accounts
- 🧵 **CodeBuddy response_format mirror** — schema directives mirrored into the last user message instead of the ignored `response_format` field (SRouter)
- 🧊 **Media-page combos** — image/tts/stt/video/music pages now list their combos instead of hiding them (ZenRouter)

---

## 📦 Migrate from Another Router

One command. No scripts to download, no node invocations to remember:

```bash
krouter9 migrate
```

That finds the foreign database, dumps it, detects the source format, previews what moves, and imports. Dry-run first if you're cautious:

```bash
krouter9 migrate --dry-run
```

Explicit sources:

```bash
krouter9 migrate --sqlite ~/.9router/db/data.sqlite
krouter9 migrate --file ~/db-export.json
```

| Source | What carries over |
|---|---|
| 9router / ZenRouter / 9router-v3 | providerConnections (accounts), apiKeys, combos, settings |
| SRouter | api_keys (with credit fields), fallback_rules |
| OmniRoute | connections, apiKeys, settings |

The import is idempotent: re-running skips rows that already exist. Verified against a live 9router database: 190 connections, 2 keys, and 9 combos moved over cleanly.

---

## 🔌 API for Automation

The full endpoint reference (loading accounts, checking balances and quota, driving the automation suites) is in [docs/API-AUTOMATION.md](./docs/API-AUTOMATION.md).

A taste:

```bash
# log in once, save the cookie
curl -c c.txt -X POST http://127.0.0.1:20128/api/auth/login \
  -H 'Content-Type: application/json' -d '{"password":"123456"}'

# list accounts
curl -b c.txt http://127.0.0.1:20128/api/providers

# credit balance of a key
curl -b c.txt http://127.0.0.1:20128/api/keys/KEY_ID/credit

# ranked model suggestions
curl -b c.txt "http://127.0.0.1:20128/api/models/smart?q=deepseek&limit=5"

# custom headers / UA on any connection
curl -b c.txt -X PUT http://127.0.0.1:20128/api/providers/PROVIDER_ID \
  -H 'Content-Type: application/json' \
  -d '{"customHeaders": {"X-Title": "myapp"}, "userAgent": "myapp/1.0"}'
```

---

## 🖥️ Connect Your Coding Tool

The dashboard's CLI Tools page writes the config for you. Supported: Claude Code, Codex, GitHub Copilot, Cline, OpenClaw, OpenCode, Antigravity, Droid, Grok, Kilo, DeepSeek TUI, and more.

| Tool | How to connect |
|---|---|
| Claude Code, Codex, Copilot, Cline, OpenCode, OpenClaw | Dashboard → CLI Tools → pick the tool → it writes the config |
| Cursor / Windsurf | Settings → Models → OpenAI base URL `http://localhost:20128/v1` |
| Anything OpenAI-compatible | Base URL `http://localhost:20128/v1` + an API key from the dashboard |

Every key's quota, usage, and fallback behavior is visible in the dashboard.

---

## ❓ FAQ

**Does this cost money?**
The router itself is free and runs locally. Providers cost whatever they normally cost. Free and self-hosted providers work the same way as paid ones.

**Where is my data?**
Everything (accounts, keys, usage history, settings) lives in SQLite under `~/.krouter9/` (or `DATA_DIR`). Nothing leaves your machine except the requests you send to providers.

**How is this different from running 9router?**
Same core engine and dashboard. KRouter9 adds credit accounting per key, a circuit breaker, model-level fallback rules, guardrails, semantic caching, quota pools, account automation suites, webhook events, and several correctness fixes. The full list with file paths is in [docs/FEATURES.md](./docs/FEATURES.md).

**Can I move my existing 9router setup over?**
Yes: `krouter9 migrate`. Accounts, keys, combos, and settings carry over in one command.

**Windows support?**
The CLI runs on Windows (state under `AppData/Roaming/krouter9`). The dashboard and API work anywhere Node runs.

---

## 📚 Documentation

| Doc | Contents |
|---|---|
| [docs/FEATURES.md](./docs/FEATURES.md) | Every added feature: config, endpoints, file paths, verification |
| [docs/API-AUTOMATION.md](./docs/API-AUTOMATION.md) | Full API reference for scripting and bots |
| [DOCKER.md](./DOCKER.md) | Container guide: build, compose, ops, image publishing |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Upstream system architecture (still applies) |
| [CHANGELOG.md](./CHANGELOG.md) | Upstream changelog through v0.5.69 |

---

## 🧬 Where the Features Came From

| Source repo | What was taken | Where it landed |
|---|---|---|
| [SRouter](https://github.com/seaavey/SRouter) | credit accounting, circuit breaker, fallback rules, rate/body limits, pricing | API keys, chat loop, middleware utils |
| [OmniRoute](https://github.com/diegosouzapw/OmniRoute) | guardrails, semantic cache, prompt templates, reasoning routing, quota pools, media endpoints, models.dev sync | chat pipeline, new tables, /v1/* routes |
| [9router-v3](https://github.com/adnan-afk/9router-v3) | QWEN OAuth, opencode-go, codebuddy/ammail/CF automation, AgentRouter proxy, media-proxy | /api/automation/*, executors |
| [ZenRouter](https://github.com/ZenRouter/ZenRouter) | TOML RTK engine, dev filters, tool compressor, streamMode/prefill/deferred-tool fixes, clientVersions, quota-aware, scheduler, correlation | open-sse engine hardening |

Each port keeps its MIT attribution header.

---

## 🏗️ Architecture

Same shape as upstream: Next.js 16, the open-sse engine, SQLite. Upstream's docs still apply: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) and [open-sse/AGENTS.md](./open-sse/AGENTS.md). The new parts sit in this order on every request:

```
client → auth → rate/body limit → guardrails → semantic cache
  → combo/account selection (quota-aware + session affinity)
  → circuit breaker → translate → executor → upstream
  → fallback rules → credit deduction → webhooks → response
```

---

## 📄 License

MIT. Built on [decolua/9router](https://github.com/decolua/9router) v0.5.69 — upstream attribution kept, and the ported components keep their per-file headers.
