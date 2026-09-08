# KRouter9 features: full reference

Every feature KRouter9 adds on top of [decolua/9router](https://github.com/decolua/9router) v0.5.69,
documented from the source code, not summarized. Each entry covers what it does, how it works,
how to use it, its configuration, where the code lives, and how to verify it.

Endpoints marked [API] have full request/response examples in [API-AUTOMATION.md](./API-AUTOMATION.md).

---

## From SRouter (https://github.com/seaavey/srouter)

### 1. API-key credit accounting

**What.** Every API key carries a USD credit limit and running usage. Requests deduct cost as they
are logged, and the dashboard and API expose the remaining balance per key.

**How it works.** Columns `creditLimit`, `usageCost`, `usageTokens`, `quotaLimit`, `rateLimit`, and
`allowedModels` live on the `apiKeys` table. A hook inside `src/lib/db/repos/usageRepo.js` adds the
request's computed cost to `usageCost` and its token count to `usageTokens` whenever usage is logged.
The hook is fail-open: a cost-calculation error logs a warning and never fails the request.

**How to use.**
- Dashboard: API Keys page shows balance per key.
- [API] `GET /api/keys/:id/credit` returns `{ creditLimit, usageCost, remaining, usageTokens, quotaLimit, rateLimit }`.
  `remaining = creditLimit - usageCost`; it is `null` when the key has no credit limit (unlimited).
- [API] `POST /api/keys/:id/credit` with `{ amount?, rateLimit?, quotaLimit?, allowedModels? }`.
  A positive `amount` tops up, a negative amount deducts.

**Configuration.** No settings keys. A key with `creditLimit = null` never blocks.

**Files.** `src/lib/db/repos/usageRepo.js` (deduction hook), `src/app/api/keys/[id]/credit/route.js`.

**Verify.** Create a key, POST `{"amount": 5}`, GET credit, make one chat request with the key,
GET credit again: `usageCost` increased, `remaining` decreased.

**Limits.** Cost comes from the pricing table; models missing from it contribute 0 cost.

### 2. Circuit breaker

**What.** Stops hammering a provider/model that is failing, and lets it recover on its own.

**How it works.** `open-sse/utils/circuitBreaker.js` tracks health per `provider/model` in memory
with three states. `healthy` is normal. Rate-limit errors (429/403) put the pair into `cooldown`
with exponential backoff starting at 30s and doubling up to 5 minutes. Five consecutive non-rate
failures put it into `exhausted`. Cooldown expiry returns the pair to `healthy`. The chat fallback
loop (`src/sse/handlers/chat.js`) calls `recordSuccess` / `recordFailure` around each upstream
attempt and skips pairs whose state is not `healthy` when picking the next account.

**How to use.** Automatic. No dashboard surface; state is in memory (restarting the server resets it).

**Files.** `open-sse/utils/circuitBreaker.js`, wired in `src/sse/handlers/chat.js`.

**Verify.** Point a key at an unreachable base URL, send 5 chat requests, watch the 6th fail fast
(skip log) instead of timing out. Wait out the backoff window and the pair is tried again.

**Limits.** In-memory only; a restart clears breaker state. Not cluster-aware.

### 3. Model-level fallback rules

**What.** Map "when model X fails with status S, retry on model Y" as durable rules instead of
hardcoded chains.

**How it works.** Table `fallbackRules` stores `sourceModel`, `targetModel`, `priority`,
`enabled`, `triggerOnStatus` (JSON array of HTTP status codes), `maxRetries`. The chat loop
consults enabled rules ordered by priority when an upstream attempt returns a triggering status.

**How to use.**
- [API] CRUD at `/api/settings/fallbacks` (GET list, POST create, PUT `/:id`, DELETE `/:id`).
- Example: source `gpt-5.6-sol`, target `bai/qwen3.8-flash`, `triggerOnStatus: [429, 403]`,
  `maxRetries: 2`.

**Files.** `src/app/api/settings/fallbacks/route.js`, `src/app/api/settings/fallbacks/[id]/route.js`,
table in `src/lib/db/schema.js`, consumption in `src/sse/handlers/chat.js`.

**Verify.** Create a rule, send a request that fails with a triggering status, observe the retry
on the target model in `/api/usage/logs`.

### 4. Rate limiting (fixed window)

**What.** Per key+IP request throttle, reusable as a utility.

**How it works.** `src/lib/rateLimit.js` implements a fixed window counter
(`rateLimit` requests/minute; `0` = unlimited). Returns `{ ok, retryAfterSec, limit }`.
It ships as a utility, not enforced globally: wire it into an entry route and return
`429` with `Retry-After` when `ok` is false. Key-level `rateLimit` values come from credit
accounting (feature 1).

**Files.** `src/lib/rateLimit.js`.

**Verify.** Set `rateLimit: 2` on a key via the credit API, send 3 rapid requests through a route
that enforces it, expect `429` on the third with `Retry-After: 60`.

### 5. Body-size limit

**What.** Guards request bodies over 25 MB.

**How it works.** `src/lib/bodyLimit.js` checks `Content-Length` before parsing
(`MAX_BODY_BYTES = 25 * 1024 * 1024`). Ships as a utility: check at entry, return `413` on oversize.

**Files.** `src/lib/bodyLimit.js`.

### 6. Pricing lookup

**What.** Per-million-token USD pricing for cost accounting.

**How it works.** Data ships in `open-sse/config/pricing-data/pricing.jsonc`;
`open-sse/utils/pricing.js` exposes `getModelPricing(id)` returning `{ input, output }` or `null`.
The credit-accounting hook (feature 1) uses it to compute request cost.

**Files.** `open-sse/config/pricing-data/`, `open-sse/utils/pricing.js`.

---

## From OmniRoute (https://github.com/diegosouzapw/OmniRoute)

### 7. Guardrails (credential masking, PII masking, prompt-injection detection)

**What.** Masks secrets and personal data in request content, and optionally blocks prompt-injection
patterns, before content reaches a provider.

**How it works.** `src/lib/guardrails/` contains three checkers plus a shared base:
- `credentialMasker.js`: masks LLM provider keys, VCS tokens, payment card numbers.
- `piiMasker.js`: masks emails, phone numbers, IPs, cards.
- `promptInjection.js`: 8 detection patterns plus a confidence scorer.

All are wired at the top of `handleSingleModelChat` and are fail-open: a guardrail error logs and
passes the original content through. Masking replaces matched spans with a stable placeholder.

**Configuration (Settings → settings keys).**
| Key | Default | Meaning |
|---|---|---|
| `guardrailsEnabled` | `false` | Master switch. Off = no masking, no detection. |
| `guardrailMaskCredentials` | `true` | Mask API keys/tokens/cards when enabled. |
| `guardrailMaskPII` | `false` | Mask emails/phones/IPs when enabled. |
| `guardrailBlockInjection` | `false` | Reject requests scoring as injection (else log only). |

**Files.** `src/lib/guardrails/` (4 files), wiring in `src/sse/handlers/chat.js`.

**Verify.** Enable in settings, send a chat request whose content contains `sk-ant-...` style text,
inspect the request in `/api/usage/request-details`: the key material is masked.

**Limits.** Regex-based, not ML. Injection detection is heuristic; keep `guardrailBlockInjection`
off until you have tuned it against your traffic.

### 8. Semantic cache

**What.** Returns cached responses for repeated identical requests within a TTL window.

**How it works.** `src/lib/semanticCache.js` hashes a normalized form of
`(model, messages)` into the `semanticCache` table with a TTL (default 1 hour, `DEFAULT_TTL_MS`).
`cacheGet(model, messages)` returns `{ hit, response }` or `{ hit: false }`; `cacheSet(...)` stores.
Fail-open: any error returns `{ hit: false }`. V1 is normalized exact-match; the upgrade path is
swapping `normalize()` for embeddings plus vector search.

**Files.** `src/lib/semanticCache.js`, table `semanticCache`.

**Verify.** Send the same non-streaming request twice within the TTL; the second response is served
from cache (check usage logs: no second upstream request).

**Limits.** Exact-match after normalization, not semantic similarity. Streaming responses are not cached.

### 9. Prompt templates

**What.** Store and reuse named prompt texts.

**How to use.** [API] CRUD at `/api/prompts`: GET list, POST `{name, content}`, DELETE `?id=`.
Table `promptTemplates`.

**Files.** `src/app/api/prompts/route.js`.

### 10. Reasoning routing

**What.** Route requests to a different model + reasoning-effort based on tags in the conversation.

**How it works.** `src/lib/reasoningRouting.js` exposes `resolveReasoningRoute(messages, rules)`.
Rules live in settings under `reasoningRoutingRules`; each rule matches a substring tag in the
messages and maps to `{ model, effort }`. Returns `null` (keep the requested model) on no match or
on any error: fail-open.

**Files.** `src/lib/reasoningRouting.js`.

**Verify.** Add a rule (tag `deep-think` → model with reasoning), send a conversation containing
the tag, confirm the routed model in usage logs.

### 11. Quota pools and token ledger

**What.** Named token budgets with allocations and a ledger for usage accounting.

**How to use.** [API] `GET /api/quota-pools` lists; `POST /api/quota-pools` with
`{name, description?, budgetTokens?}` creates.

**How it works.** Three tables: `quotaPools` (the budget), `quotaAllocations` (shares per key/pool),
`tokenLedger` (append-only token accounting).

**Files.** `src/app/api/quota-pools/route.js`, tables in `src/lib/db/schema.js`.

### 12. Media endpoints (rerank, moderations, OCR)

**What.** OpenAI/Cohere/Mistral-style pass-through endpoints.

**Endpoints.**
- `POST /v1/rerank`: Cohere rerank (`{model, query, documents[], top_n?}`).
- `POST /v1/moderations`: OpenAI moderation.
- `POST /v1/ocr`: Mistral OCR (`{model?, document}`).
- `POST /v1/music`: 501 stub on purpose (donor flow needs credentials + polling; not wired).

**How it works.** Key via `Authorization: Bearer` (same API keys as chat). Requests pass through to
the provider backing the requested model.

### 13. models.dev catalog sync

**What.** Fetches the public models.dev catalog for model metadata lookups.

**How it works.** `src/lib/modelsDevSync.js`: `fetchModelsDev()` fetches
`https://models.dev/api.json` with a disk cache; `searchModelsDev(query)` returns
`[{provider, id, name}]`. Fail-open: network failure returns the last cached snapshot.

---

## From 9router-v3 (https://github.com/adnan-afk/9router-v3)

### 14. QWEN OAuth

**What.** Connect QWEN accounts via device-code flow with PKCE.

**How to use.** [API] `POST /api/oauth/qwen/start` returns `{device_code, user_code, verification_uri}`.
Visit the URI, enter the code, then poll `POST /api/oauth/qwen/poll` with `device_code`.

**Files.** `src/lib/oauth/providers/qwen.js`, `src/lib/oauth/constants/oauth.js` (`QWEN_CONFIG`).

**Verify.** Run the start/poll sequence with a real QWEN account; the account appears under providers.

**Limits.** The provider registry entry (`open-sse/providers/registry/qwen.js`) is not ported yet,
so QWEN accounts authenticate but do not appear in the model catalog integration. Executor-level
use works through `opencode-go` (below).

### 15. opencode-go executor

**What.** Executor that routes QWEN-family models through the OpenCode-Go client handshake.

**How it works.** Registered in the executor map as `"opencode-go"` in `open-sse/executors/index.js`.

### 16. ammail: temp-mail OTP service

**What.** Creates throwaway inboxes and captures one-time codes for account signup automation.

**How to use.** [API] `GET /api/automation/ammail` (status, inboxes, recent OTPs).
Actions via POST: `list-domains`, `settings`, `test-connection`, `inbox-create`, `inbox-delete`,
`otps-delete-bulk`. `GET /api/automation/ammail/otps/:id` fetches one OTP and marks it used.
`GET /api/automation/ammail/webhook` receives push-OTP callbacks.

**Configuration.** Settings keys: `ammail_base_url`, `ammail_api_key`, `ammail_default_domain`,
`ammail_webhook_secret`.

**Files.** `src/app/api/automation/ammail/route.js` (+ `otps/[id]`, `webhook`), table `ammailOtps`.

### 17. codebuddy: bulk signup jobs

**What.** Batch account-creation jobs with per-account operations and a debug VNC surface.

**How to use.** [API] `GET /api/automation/codebuddy` (accounts + jobs).
`POST` with `{"action":"create-job","type":"signup","count":5,"proxy":"http://user:pass@host:port"}`.
Per-account actions via `POST /api/automation/codebuddy/:id` (`{"action":"run"}`).
Debug helpers: `/api/automation/codebuddy/debug-vnc`, `/test-proxy`.

**How it works.** Tables `codebuddyAccounts` and `codebuddyJobs`. Job states:
`queued -> running -> completed|failed|stopped`.

### 18. Cloudflare Workers AI provisioning

**What.** Creates a scoped Cloudflare API token and wires it as a provider connection in one call.

**How to use.** [API] `POST /api/automation/cloudflare-ai` with
`{globalApiKey, email, tokenName}`.

**Files.** `src/app/api/automation/cloudflare-ai/route.js`.

### 19. AgentRouter WAF-bypass proxy

**What.** Local reverse proxy that passes WAF checks (codex_cli_rs UA spoof, `acw_tc` cookie
refreshed every 15 minutes) for AgentRouter-fronted providers.

**How it works.** `src/lib/proxy-agentrouter/engine.js`: `startAgentRouterProxy()` spawns a local
proxy; import it from a route or script. No dashboard UI.

### 20. Custom request headers and User-Agent per connection

**What.** Any provider connection (API-key, OAuth, compatible-node) can send custom request
headers and a User-Agent override on every upstream request.

**How to use.**
- Dashboard: Providers -> Add/Edit connection -> "User-Agent override" and
  "Custom request headers (JSON)" fields.
- [API] POST /api/providers or PUT /api/providers/:id with:
  `{"customHeaders": {"X-Title": "myapp", "HTTP-Referer": "https://my.app"}, "userAgent": "myapp/1.0"}`.
  Empty object clears custom headers; empty string clears the User-Agent.

**How it works.** Stored in the connection's `providerSpecificData` (`customHeaders`, `userAgent`).
`open-sse/executors/base.js` `buildHeaders` applies them last, so they can deliberately override
auth headers and default User-Agents.

**Files.** `open-sse/executors/base.js`, `src/app/api/providers/route.js`,
`src/app/api/providers/[id]/route.js`, dashboard modals.

**Verify.** Set a custom header, send one chat request, inspect the upstream receipt or a
request-echo endpoint to see the header arrive.

### 20b. Media proxy

**What.** Server-side proxy for CDN URLs that blocks CORS.

**How to use.** `GET /api/media-proxy?url=<encoded-url>`. Only allowlisted domains are proxied
(Google storage, weavy.ai); everything else is rejected.

**Files.** `src/app/api/media-proxy/route.js` (82 lines, `ALLOWED_DOMAINS` whitelist).

---

## From ZenRouter (https://github.com/ZenRouter/ZenRouter)

### 21. RTK filter extensions + TOML engine

**What.** More token-saving filters for tool outputs, including declarative TOML filters.

**How it works.** Registered in `open-sse/rtk/registry.js`, auto-detected in `open-sse/rtk/autodetect.js`.
New detection branches: `cargoTest`, `goTest`, `mypy`, `pytest`, `vitest`, `env`, `jsonCompact`,
plus `truncate` and the zenrouter `readNumbered` extension. TOML declarative filters run through
`open-sse/rtk/tomlEngine.js` with rule files in `open-sse/rtk/custom-filters/*.toml`
(brew, make, ps, systemctl, terraform).

**Verify.** Send a chat whose tool output contains pytest/cargo output; check the request details
to see the compressed content.

### 22. Tool-name compressor (Gemini fix)

**What.** Fixes Gemini `INVALID_ARGUMENT` on tool names over 64 characters (upstream issue #3622).

**How it works.** `open-sse/utils/toolCompressor.js`: `compressToolNames` rewrites tool names on
the request; `decloakOpenAIChunk` restores them on the response path (OPENAI and OPENAI_RESPONSES
same-format chunk paths), so clients never see compressed names.

**Files.** `open-sse/utils/toolCompressor.js`, wiring in `open-sse/translator/index.js`.

### 23. Claude translator correctness fixes

**What.** Three upstream fixes ported into `open-sse/translator/formats/claude.js` and
`open-sse/handlers/chatCore.js`:
- `thoughtSignature` preserved on toolCallIds.
- Assistant prefill policy support.
- Deferred-tool cache guard (issue #3567).
- StreamMode: an absent `stream` key means non-streaming (issue #3492): via wholesale
  `chatCore.js` streamMode handling.

### 24. Client-version / UA spoof registry

**What.** Centralized current client versions and user agents (`open-sse/config/clientVersions.js`)
so provider handshakes look current.

### 25. Quota-aware account selection

**What.** Prefers accounts with remaining quota when picking who serves a request.

**How it works.** `src/sse/services/quotaAwareSelection.js`. Settings:
`quotaAwareSelection` (default `true`), `quotaCacheTtlMs` (default `45000`),
`quotaAwareProviders` (default `["claude", "codex"]`).

**Limits.** The auth-loop integration from the donor is deferred; selection consults the quota
cache but does not itself refresh auth.

### 26. Scheduler lifecycle, request correlation, CLI memory flags

**What.** Operational hardening from the donor: scheduler start/stop lifecycle
(`src/lib/schedulerLifecycle.js`), per-request correlation IDs surfaced in logs
(`src/sse/utils/requestCorrelation.js`), cgroup-aware memory flags for CLI child processes
(`cli/hooks/nodeFlags.js`), and a live-model fetcher (`src/shared/utils/providerLiveModels.js`).

---

## KRouter9 originals

### 27. Webhook dispatcher

**What.** Push router events to any HTTP endpoint, signed.

**How to use.** Configure the `webhookDispatcher` settings object:
`{url, secret, events: ["account_error", "quota", "credit_low", "fallback"]}`.
[API] `POST /api/webhooks` configures and test-pings; `GET /api/webhooks` shows the delivery log.

**How it works.** Delivery is `POST` JSON `{event, payload, ts, source}` with header
`X-KRouter9-Signature: <secret>`.

**Files.** `src/lib/webhookDispatcher.js`, `src/app/api/webhooks/route.js`.

### 28. Session affinity

**What.** Pins a conversation to one upstream account so multi-turn context stays on the same account.

**How it works.** `src/lib/sessionAffinity.js` keys affinity by client API key + hash of the first
user message (stable conversation id), TTL 30 minutes, in-memory map. Fail-open: any error falls
back to normal account selection.

**Verify.** Send two messages of the same conversation; both appear under the same connection id
in usage logs.

**Limits.** In-memory (resets on restart); not shared across instances.

### 29. Model intelligence

**What.** Rank-aware model suggestions from public leaderboards.

**How to use.** [API] `POST /api/models/smart` syncs rankings; `GET /api/models/smart?q=deepseek&limit=5`
returns `{"suggestions": [{model, rank, context, pricing}]}`.

**How it works.** `src/lib/modelIntelligence.js` syncs into `settings.modelIntelligence` (fail-open,
keeps the last snapshot on network failure).

### 30. Migration tools

**What.** Move accounts, keys, combos, and settings from another router into KRouter9.

**How to use.**
```bash
node tools/migrations/sqlite-dump.js ~/.9router/db/data.sqlite   # dump another SQLite
node tools/migrations/import.js detect ~/db-export.json          # detect source format
node tools/migrations/import.js import ~/db-export.json --dry-run
node tools/migrations/import.js import ~/db-export.json
node tools/migrations/export.js                                  # KRouter9 -> JSON
```

**What carries over.** 9router/ZenRouter/9router-v3: providerConnections, apiKeys, combos, settings.
SRouter: api_keys (with credit fields), fallback_rules. OmniRoute: connections, apiKeys, settings.

**Verify.** Idempotent: re-running skips existing rows (provider+email / key / rule pair).
Verified against a live 9router database: 190 connections, 2 keys, 9 combos.

---

## New data model (all tables)

`codebuddyAccounts`, `codebuddyJobs`, `ammailOtps`, `fallbackRules`, `semanticCache`,
`promptTemplates`, `quotaPools`, `quotaAllocations`, `tokenLedger` were added to the upstream schema
(`src/lib/db/schema.js`), which otherwise keeps the 11 upstream tables unchanged.

## Request pipeline order

```
client request
  -> API-key auth
  -> guardrails (if guardrailsEnabled)
  -> semantic cache lookup (hit -> serve)
  -> combo/account selection (quota-aware + session affinity)
  -> circuit breaker gate
  -> translate -> executor -> upstream
  -> fallback rules on failure (triggerOnStatus, maxRetries)
  -> credit deduction on log
  -> webhook events
  -> response
```


## Donor rounds (2026-09-07/08)

### DB integrity gate (from ZenRouter 8db56e4)

**What it does.** At startup, before any schema mutation or backup pruning, the migration entry runs
`PRAGMA quick_check` against the SQLite file (`src/lib/db/integrity.js`). On corruption it throws
`DatabaseCorruptionError` with a recovery message pointing at `~/.krouter9/db/backups/` candidates.

**Why.** Previously the driver chain fell through to the next adapter on corruption and could boot
with an empty database while backups were silently pruned.

**Verify.** `tests/unit/db-integrity-safety.test.js`. Corrupt a copy of `data.sqlite`
(`head -c 100 /dev/urandom > /tmp/bad.sqlite`), point `DATA_DIR` at it, boot: process exits with the
integrity error instead of starting.

### Combo first-chunk probe (regression: opus-4.8)

**What it does.** When a request runs inside a combo, `handleStreamingResponse` reads the first SSE
chunk from the upstream before committing. If the chunk is an error event (`data: {"error": …}`),
the stream is empty (`done` before data), or nothing arrives within 15s, chatCore returns
`success:false` with a JSON error — and `handleComboChat` advances to the next model.

**Why.** Providers can answer 200 + SSE headers and still fail (capacity events mid-pipe). The combo
loop only inspects `response.ok`, so those failures were invisible and the client got a broken
stream instead of the next provider.

**Verify.** `tests/unit/combo-first-chunk-probe.test.js`. Live: point a combo at a provider whose
upstream returns `data: {"error": ...}` with HTTP 200 and watch `COMBO Trying model 2/N`.

### Enforcing CSP (from ZenRouter d562bff)

**What it does.** `next.config.mjs` gains a `headers()` block: strict
`Content-Security-Policy` for `/api/*`, `/v1/*`, `/v1beta/*`
(`default-src 'none'; frame-ancestors 'none'; base-uri 'none'`) and a working dashboard CSP
(self + GA/Insights + jsdelivr for the Monaco editor on the translator page) plus
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` on everything else.

**Verify.** `curl -sD - -o /dev/null http://127.0.0.1:20128/dashboard | grep -i content-security`.

### Request logs: client IP + itemized cost (from SRouter 9ff62de)

**What it does.** Every request detail row stores the client IP (from the unspoofable
`x-9r-real-ip` header that `custom-server.js` derives from the TCP socket; XFF is trusted only from
a loopback reverse proxy) and the per-request USD cost computed from the pricing table at stream
completion. Both are visible in Usage → Request Details (IP column + cost in the JSON).

**Verify.** Send a request through `/v1`, open Usage → Request Details: the row shows the caller IP;
the row JSON contains `cost` matching the usageHistory cost for the same request.

**Turning logging on.** Request Details writes only when observability is enabled. Precedence:
`ENABLE_REQUEST_LOGS=true` (env, forces on) → dashboard Settings toggle (`enableObservability`)
→ `OBSERVABILITY_ENABLED` env (default on). Note the dashboard toggle defaults to **off** in
fresh installs — if the logs table is empty, flip the toggle or set the env var.

### All-time totals on request logs (from SRouter 5443f12)

**What it does.** `GET /api/usage/request-details` returns `allTime` — requests, prompt/completion/
cached tokens, and summed cost over the entire filtered dataset, not just the current page.

**Verify.** `curl -b c.txt http://127.0.0.1:20128/api/usage/request-details | python3 -m json.tool |
grep allTime` — the numbers match a manual `SELECT COUNT(*), SUM(...)` over the same filter.

### Translator tool_calls guards (from OmniRoute 2b2d34eb)

**What it does.** `openai-to-cursor.js` requires `Array.isArray(msg.tool_calls)` before iterating;
the same hardening was applied to `openai-responses.js` (delta.tool_calls),
`claude-to-openai.js`, and `openai-to-kiro.js`. A malformed
`"tool_calls": "string"` from any client now degrades to "ignored" instead of a TypeError crash.

**Verify.** POST a chat body with `{"role":"assistant","tool_calls":"x"}` to a cursor-target
combo — response is a normal model error, never a stack trace.

### Antigravity static model catalog (from ZenRouter 468ae8c)

**What it does.** The Antigravity entry in `providers/[id]/models/route.js` no longer POSTs to
`daily-cloudcode-pa.sandbox.googleapis.com` (403/404 for consumer accounts). It returns the static
curated list from `getModelsByProviderId("antigravity")`.

**Verify.** Open Providers → Antigravity → model list renders instantly with no upstream call.

### CodeBuddy response_format mirror (from SRouter ac92a2b)

**What it does.** CodeBuddy is stream-only and ignores — or answers prose to — `response_format`.
Both `codebuddy-cn.js` and `codebuddy-intl.js` now delete `response_format` and append the JSON
directive ("Respond only in valid JSON." or the full `json_schema` payload) to the last user
message text.

**Verify.** Send `{"response_format":{"type":"json_schema","json_schema":{...}}}` through a
codebuddy combo member; the reply is valid JSON and the upstream body contains no
`response_format` field.

### Media-page combos (from ZenRouter b7adec9)

**What it does.** `media-providers/[kind]/page.js` now lists all combo-capable kinds
(embedding, image, imageToText, tts, stt, video, music) instead of an empty set that hid
combos from every media page.

**Verify.** Create a combo containing an image member — it appears on Dashboard → Media → Image.
