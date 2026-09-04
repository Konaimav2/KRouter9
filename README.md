<div align="center">
  <img src="./images/krouter9.svg" alt="KRouter9" width="140"/>

  # KRouter9

  Built on [decolua/9router](https://github.com/decolua/9router) v0.5.65 with 30 features merged in from srouter, OmniRoute, 9router-v3, and ZenRouter.

  It routes AI coding tools (Claude Code, Cursor, Antigravity, Copilot, Codex, Gemini, OpenCode, Cline) across 40+ providers, and adds credit accounting, a circuit breaker, guardrails, semantic caching, account automation, and webhook events on top of the base router.

  [Quick start](#quick-start) · [What's added](#whats-added-over-9router) · [Migration](#migrate-from-another-router) · [API docs](./docs/API-AUTOMATION.md) · [Feature details](./docs/FEATURES.md)

</div>

---

## Quick start

Install globally:

```bash
npm install -g krouter9
krouter9
```

The dashboard opens at `http://localhost:20128`, the API at `http://localhost:20128/v1`.

Or run it without installing:

```bash
npx krouter9
```

Docker:

```bash
git clone https://github.com/Konaimav2/KRouter9.git
cd KRouter9
docker build -t krouter9 .
docker run -d --name krouter9 --restart unless-stopped \
  -p 20128:20128 \
  -v "$HOME/.krouter9:/app/data" \
  -e DATA_DIR=/app/data \
  krouter9
```

Or `docker compose up -d` (the compose file is in the repo). See [DOCKER.md](./DOCKER.md) for the full container guide.

Running from source, for development:

```bash
git clone https://github.com/Konaimav2/KRouter9.git
cd KRouter9
cp .env.example .env
npm install
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

For production, build and start:

```bash
npm run build
PORT=20128 HOSTNAME=0.0.0.0 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run start
```

Then connect a provider and your tools:

1. Open `http://localhost:20128/dashboard`. The default password is `123456`; change it in Settings.
2. Go to Providers and connect an account (OAuth or API key).
3. Point your coding tool at the router:

```
Endpoint: http://localhost:20128/v1
API Key:  [copy from dashboard, Endpoint & Key page]
Model:    <provider>/<model>   e.g. antigravity/claude-sonnet-4-6
```

Coming from another router? One command moves your accounts, keys, and combos over. See [Migration](#migrate-from-another-router).

---

## What's added over 9router

Everything below was ported from source and tested against a running instance. File paths and per-feature notes are in [docs/FEATURES.md](./docs/FEATURES.md).

### From srouter

Per-API-key credit accounting: `creditLimit`, `usageCost`, and `usageTokens` on every key, deducted as requests are logged. Balance and top-ups at `GET/POST /api/keys/:id/credit`.

A circuit breaker per provider/model: healthy, then cooldown with 30s to 5min exponential backoff on rate limits, then exhausted after 5 consecutive failures. It recovers on its own and sits inside the account fallback loop.

Model-level fallback rules with full CRUD at `/api/settings/fallbacks`: map a source model to a target model, trigger on specific status codes like 429 or 403, set priority and max retries.

Rate limiting (fixed window, per key and IP) and a 25 MB body-size guard, as reusable utilities in `src/lib/rateLimit.js` and `src/lib/bodyLimit.js`.

A pricing dataset with a lookup function for per-million-token USD costs.

### From OmniRoute

Guardrails: credential masking (LLM, VCS, payment keys), PII masking, and a prompt-injection detector. Off by default, configurable in settings, wired at the top of the chat handler, and fail-open.

A semantic cache (normalized exact match with TTL, stored in the `semanticCache` table) plus prompt template CRUD at `/api/prompts`.

Reasoning routing rules that map tag patterns in a conversation to a model and effort level.

Quota pools, allocations, and a token ledger (three tables, one API at `/api/quota-pools`).

Extra media endpoints: `/v1/rerank` (Cohere), `/v1/moderations` (OpenAI), `/v1/ocr` (Mistral), all pass-through. Plus a models.dev catalog sync with ranked suggestions at `/api/models/smart`.

### From 9router-v3

Account automation: codebuddy bulk signup jobs, the ammail temp-mail OTP service with a push webhook, and Cloudflare Workers AI token provisioning.

An AgentRouter WAF-bypass reverse proxy (UA spoofing with automatic `acw_tc` cookie refresh) and a media proxy with a domain allowlist.

QWEN OAuth (device code flow with PKCE) and an opencode-go executor.

### From ZenRouter

Correctness fixes: a TOML engine for declarative RTK filters, eight dev-output RTK filters (cargoTest, goTest, mypy, pytest, vitest, env, jsonCompact, truncate), the Gemini 64-char tool-name fix (issue #3622), the deferred-tool cache guard (#3567), the StreamMode framing fix (#3492), thought-signature tool call IDs, an assistant prefill policy, a client-version/UA spoof registry, quota-aware account selection, scheduler lifecycle hardening, request correlation IDs, and cgroup-aware CLI memory limits.

### KRouter9 originals

A webhook dispatcher that pushes signed events (account_error, quota, credit_low, fallback) to any endpoint.

Session affinity, which pins a conversation to one account so multi-turn context doesn't shift between upstream accounts.

Model intelligence: an OpenRouter rankings sync with search over 150 ranked models.

---

## Migrate from another router

One tool handles it, and it detects the source format on its own.

Dump the old router's SQLite database (works for 9router, ZenRouter, and 9router-v3):

```bash
node tools/migrations/sqlite-dump.js ~/.9router/db/data.sqlite
```

Then import. Dry-run first to see what would move:

```bash
node tools/migrations/import.js detect  ~/.9router/db-export.json
node tools/migrations/import.js import  ~/.9router/db-export.json --dry-run
node tools/migrations/import.js import  ~/.9router/db-export.json
```

| Source | What carries over |
|---|---|
| 9router / ZenRouter / 9router-v3 | providerConnections (accounts), apiKeys, combos, settings |
| srouter | api_keys (with credit fields), fallback_rules |
| OmniRoute | connections, apiKeys, settings |

The import is idempotent: re-running skips rows that already exist. For backups between KRouter9 instances, use `node tools/migrations/export.js` and import the resulting JSON.

This was verified against a live 9router database: 190 connections, 2 keys, and 9 combos moved over cleanly.

---

## API for automation

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
```

---

## Connect your coding tool

The router speaks the OpenAI Chat Completions format and also accepts Claude and Gemini request shapes, so most tools work by pointing them at one URL.

The dashboard's CLI Tools page writes the config for you. Supported tools: Claude Code, Codex, GitHub Copilot, Cline, OpenClaw, OpenCode, Antigravity, Droid, Grok, Kilo, DeepSeek TUI, and more.

| Tool | How to connect |
|---|---|
| Claude Code, Codex, Copilot, Cline, OpenCode, OpenClaw | Dashboard → CLI Tools → pick the tool → it writes the config |
| Cursor / Windsurf | Settings → Models → OpenAI base URL `http://localhost:20128/v1` |
| Anything OpenAI-compatible | Base URL `http://localhost:20128/v1` + an API key from the dashboard |

Every key's quota, usage, and fallback behavior is visible in the dashboard.

---

## FAQ

**Does this cost money?**
The router itself is free and runs locally. Providers cost whatever they normally cost. Free and self-hosted providers work the same way as paid ones.

**Where is my data?**
Everything (accounts, keys, usage history, settings) lives in SQLite under `~/.krouter9/` (or `DATA_DIR`). Nothing leaves your machine except the requests you send to providers.

**How is this different from running 9router?**
Same core engine and dashboard. KRouter9 adds credit accounting per key, a circuit breaker, model-level fallback rules, guardrails, semantic caching, quota pools, account automation suites, webhook events, and several correctness fixes. The full list with file paths is in [docs/FEATURES.md](./docs/FEATURES.md).

**Can I move my existing 9router setup over?**
Yes. See [Migration](#migrate-from-another-router): accounts, keys, combos, and settings carry over in one command.

**Windows support?**
The CLI runs on Windows (it stores state under `AppData/Roaming/krouter9`). The dashboard and API work anywhere Node runs.

## Documentation

| Doc | Contents |
|---|---|
| [docs/FEATURES.md](./docs/FEATURES.md) | Every added feature with file paths |
| [docs/API-AUTOMATION.md](./docs/API-AUTOMATION.md) | Full API reference for scripting and bots |
| [DOCKER.md](./DOCKER.md) | Container guide: build, compose, ops, image publishing |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Upstream system architecture (still applies) |
| [CHANGELOG.md](./CHANGELOG.md) | Upstream changelog through v0.5.65 |

---

## Where the features came from

| Source repo | What was taken | Where it landed |
|---|---|---|
| [srouter](https://github.com/seaavey/srouter) | credit accounting, circuit breaker, fallback rules, rate/body limits, pricing | API keys, chat loop, middleware utils |
| [OmniRoute](https://github.com/diegosouzapw/OmniRoute) | guardrails, semantic cache, prompt templates, reasoning routing, quota pools, media endpoints, models.dev sync | chat pipeline, new tables, /v1/* routes |
| [9router-v3](https://github.com/adnan-afk/9router-v3) | QWEN OAuth, opencode-go, codebuddy/ammail/CF automation, AgentRouter proxy, media-proxy | /api/automation/*, executors |
| [ZenRouter](https://github.com/ZenRouter/ZenRouter) | TOML RTK engine, dev filters, tool compressor, streamMode/prefill/deferred-tool fixes, clientVersions, quota-aware, scheduler, correlation | open-sse engine hardening |

Each port keeps its MIT attribution header. The upstream audit with per-feature evidence paths is in [docs/FEATURES.md](./docs/FEATURES.md).

---

## Architecture

Same shape as upstream: Next.js 16, the open-sse engine, SQLite. Upstream's docs still apply: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) and [open-sse/AGENTS.md](./open-sse/AGENTS.md). The new parts sit in this order on every request:

```
client → auth → rate/body limit → guardrails → semantic cache
  → combo/account selection (quota-aware + session affinity)
  → circuit breaker → translate → executor → upstream
  → fallback rules → credit deduction → webhooks → response
```

---

## License

MIT. This carries upstream [decolua/9router](https://github.com/decolua/9router) attribution, and the ported components keep their per-file headers.
