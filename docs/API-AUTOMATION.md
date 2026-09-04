# KRouter9 — Automation API

Base URL: your KRouter9 instance (default `http://127.0.0.1:20128`).
All dashboard APIs require the session cookie from login. Chat APIs (`/v1/*`) require an API key.

## 1. Authenticate (get session cookie)

```bash
curl -c cookies.txt -X POST http://127.0.0.1:20128/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password": "YOUR_DASHBOARD_PASSWORD"}'
# → {"success":true}
# use: curl -b cookies.txt ... for all calls below
```

## 2. Accounts (provider connections)

### List accounts + status
```bash
curl -b cookies.txt http://127.0.0.1:20128/api/providers
# → [{"id","provider","email","name","isActive","testStatus",...}, ...]
```

### Add an API-key account
```bash
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/providers \
  -H 'Content-Type: application/json' \
  -d '{"provider":"openai-compatible","name":"my-provider","email":"me@x.com",
       "authType":"apikey","data":{"apiKey":"sk-...","baseUrl":"https://api.x.com/v1"}}'
```

### Delete an account
```bash
curl -b cookies.txt -X DELETE http://127.0.0.1:20128/api/providers/PROVIDER_ID
```

### OAuth accounts (antigravity/claude/codex/gemini-cli/qwen/iflow/kimi/...)
```bash
# 1. get OAuth start URL
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/oauth/antigravity/start
# 2. open URL in browser, complete Google login
# 3. paste the localhost callback URL back:
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/oauth/antigravity/callback \
  -H 'Content-Type: application/json' \
  -d '{"callbackUrl":"http://localhost:443/?code=...&state=..."}'
```
QWEN uses device-code flow: `POST /api/oauth/qwen/start` returns `{ device_code, user_code, verification_uri }` — visit the URI, enter the code, then poll `POST /api/oauth/qwen/poll` with `device_code`.

## 3. Quota / balance / health of accounts

### Per-account quota check
```bash
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/providers/PROVIDER_ID/test
# → { ok, status, latencyMs, models?, error? }
```

### Usage snapshot (per key / per model)
```bash
curl -b cookies.txt http://127.0.0.1:20128/api/usage/stats
curl -b cookies.txt http://127.0.0.1:20128/api/usage/chart?range=7d
```

### API-key credit balance
```bash
curl -b cookies.txt http://127.0.0.1:20128/api/keys/KEY_ID/credit
# → {"id","name","creditLimit","usageCost","usageTokens","quotaLimit","rateLimit","remaining"}
# remaining = creditLimit - usageCost (null = unlimited)

# add / deduct credit (negative amount deducts), set rateLimit:
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/keys/KEY_ID/credit \
  -H 'Content-Type: application/json' -d '{"amount": 5.0, "rateLimit": 60}'
```

### Circuit breaker status (per provider/model health)
Circuit states: `healthy` → `cooldown` (30s→5min exp backoff) → `exhausted` (5+ fails).
Query via chat fallback logs or `GET /api/settings` (breaker state is in-memory).
Reset by restarting, or wait out the cooldown.

## 4. Fallback rules (model-level)

```bash
# list
curl -b cookies.txt http://127.0.0.1:20128/api/settings/fallbacks
# create: when gpt-5.6-sol returns 429/403, retry on target model
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/settings/fallbacks \
  -H 'Content-Type: application/json' \
  -d '{"sourceModel":"gpt-5.6-sol","targetModel":"bai/qwen3.8-flash",
       "priority":1,"triggerOnStatus":[429,403],"maxRetries":2}'
# update
curl -b cookies.txt -X PUT http://127.0.0.1:20128/api/settings/fallbacks/RULE_ID \
  -H 'Content-Type: application/json' -d '{"enabled":false}'
# delete
curl -b cookies.txt -X DELETE http://127.0.0.1:20128/api/settings/fallbacks/RULE_ID
```

## 5. Quota pools (token budgets)

```bash
curl -b cookies.txt http://127.0.0.1:20128/api/quota-pools
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/quota-pools \
  -H 'Content-Type: application/json' -d '{"name":"team-a","budgetTokens":10000000}'
```

## 6. Automation suites

### ammail (temp-mail OTP)
```bash
# status + recent OTPs
curl -b cookies.txt http://127.0.0.1:20128/api/automation/ammail
# actions: list-domains | settings | test-connection | inbox-create | inbox-delete | otps-delete-bulk
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/automation/ammail \
  -H 'Content-Type: application/json' -d '{"action":"inbox-create","alias":"mysignup"}'
# one OTP + mark used
curl -b cookies.txt http://127.0.0.1:20128/api/automation/ammail/otps/OTP_ID
# webhook receiver for push-OTP
curl -b cookies.txt http://127.0.0.1:20128/api/automation/ammail/webhook
```
Settings keys: `ammail_base_url`, `ammail_api_key`, `ammail_default_domain`, `ammail_webhook_secret`.

### codebuddy (bulk signup jobs)
```bash
curl -b cookies.txt http://127.0.0.1:20128/api/automation/codebuddy        # accounts + jobs
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/automation/codebuddy \
  -H 'Content-Type: application/json' \
  -d '{"action":"create-job","type":"signup","count":5,"proxy":"http://user:pass@host:port"}'
# single account ops
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/automation/codebuddy/ACCOUNT_ID \
  -H 'Content-Type: application/json' -d '{"action":"run"}'
```
Job states: `queued → running → completed|failed|stopped`. Tables: `codebuddyAccounts`, `codebuddyJobs`.

### cloudflare-ai (CF token provisioning)
```bash
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/automation/cloudflare-ai \
  -H 'Content-Type: application/json' \
  -d '{"globalApiKey":"...","email":"you@x.com","tokenName":"kr9-workers-ai"}'
# Creates a Workers AI scoped token + provider connection automatically.
```

### AgentRouter WAF-bypass proxy (engine, no UI)
`src/lib/proxy-agentrouter/engine.js` — spawn locally:
```js
import { startAgentRouterProxy } from "@/lib/proxy-agentrouter/engine.js";
// UA spoof codex_cli_rs + auto acw_tc cookie refresh (15min)
```

## 7. Webhook dispatcher (event push)

```bash
# configure
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/webhooks \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://my.bot/hook","secret":"mysecret",
       "events":["account_error","quota","credit_low","fallback"]}'
# test ping
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/webhooks -d '{"test":true}' \
  -H 'Content-Type: application/json'
# delivery log
curl -b cookies.txt http://127.0.0.1:20128/api/webhooks
```
Delivery: `POST` JSON `{event, payload, ts, source}` + header `X-KRouter9-Signature: <secret>`.

## 8. Model intelligence (rankings)

```bash
# sync rankings from openrouter (150 models, context+pricing)
curl -b cookies.txt -X POST http://127.0.0.1:20128/api/models/smart
# query
curl -b cookies.txt "http://127.0.0.1:20128/api/models/smart?q=deepseek&limit=5"
# → {"suggestions":[{"model","rank","context","pricing"}]}
```

## 9. Media endpoints (pass-through, key via Authorization header)

```bash
curl -X POST http://127.0.0.1:20128/v1/rerank -H "Authorization: Bearer COHERE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"rerank-v3.5","query":"q","documents":["a","b"],"top_n":3}'
curl -X POST http://127.0.0.1:20128/v1/moderations -H "Authorization: Bearer OPENAI_KEY" \
  -H 'Content-Type: application/json' -d '{"input":"text","model":"omni-moderation-latest"}'
curl -X POST http://127.0.0.1:20128/v1/ocr -H "Authorization: Bearer MISTRAL_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"mistral-ocr-latest","document":{"type":"document_url","document_url":"https://...pdf"}}'
```

## 10. Chat (the actual router endpoint)

```bash
curl http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer sk-YOUR_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"gpt-5.6-sol","messages":[{"role":"user","content":"hi"}],"stream":false}'
```
Automatic per request: guardrails (if enabled) → semantic cache → combo/account
fallback → circuit breaker → fallback rules → credit deduction → webhook events.

## 11. Migration (from other routers)

```bash
# A) dump another SQLite (9router/ZenRouter/9router-v3):
node tools/migrations/sqlite-dump.js ~/.9router/db/data.sqlite
# B) import (auto-detects 9router-family / srouter / OmniRoute shape):
node tools/migrations/import.js detect  ~/dump-export.json
node tools/migrations/import.js import  ~/dump-export.json --dry-run
node tools/migrations/import.js import  ~/dump-export.json
# C) KRouter9 → KRouter9:
node tools/migrations/export.js
node tools/migrations/import.js import krouter9-export.json
```
Idempotent — re-running skips existing rows (provider+email / key / rule pair).

---

**Rate limits / body limits**: `src/lib/rateLimit.js` + `bodyLimit.js` are utilities — wire them
into a custom entry route if you need per-key throttling (25 MB body cap, fixed-window per key+IP).
