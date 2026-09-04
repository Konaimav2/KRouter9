# KRouter9 — Feature Documentation

> Fork of [decolua/9router](https://github.com/decolua/9router) v0.5.65 + 26 ported features
> from srouter, OmniRoute, 9router-v3, ZenRouter. License: MIT (attribution kept per file).

Base 9router features (combos, OAuth providers, tunnels, MITM, RTK, dashboard, etc.)
are documented upstream. This file documents **only what KRouter9 adds**.

---

## 1. API-Key Credit Accounting (srouter)

Keys carry `creditLimit` (USD), `usageCost` (accumulated), `usageTokens`,
`quotaLimit`, `rateLimit`, `allowedModels`.

- `GET /api/keys/:id/credit` → `{ creditLimit, usageCost, remaining, usageTokens, quotaLimit, rateLimit }`
  (`remaining = creditLimit - usageCost`, `null` when unlimited)
- `POST /api/keys/:id/credit` → `{ amount?, rateLimit?, quotaLimit?, allowedModels? }`
  (`amount` adds credit, negative deducts)
- Cost auto-accumulates on every logged request (`usageRepo.js` hook, fail-open).

## 2. Circuit Breaker (srouter)

`open-sse/utils/circuitBreaker.js` — per `provider/model` health states:
`healthy` → `cooldown` (rate-limit errors, exp backoff 30s→5min) →
`exhausted` (5+ non-rate failures). Auto-recovers after cooldown.
Wired in `src/sse/handlers/chat.js` fallback loop (`recordSuccess`/`recordFailure`).

## 3. Model-Level Fallback Rules (srouter)

CRUD at `/api/settings/fallbacks` (+ `/:id` PUT/DELETE).
Table `fallbackRules`: `sourceModel → targetModel`, `priority`, `enabled`,
`triggerOnStatus` (JSON array of HTTP codes), `maxRetries`.

## 4. Rate Limit + Body Limit (srouter)

- `src/lib/rateLimit.js` — fixed-window per key+IP (`rateLimit` req/min, 0 = unlimited).
  Returns `{ ok, retryAfterSec, limit }`. **Not auto-enforced — wire into your
  entry route and return 429 with `Retry-After` when `!ok`.**
- `src/lib/bodyLimit.js` — 25 MB `Content-Length` guard.
  **Not auto-enforced — check at entry, return 413 on `!ok`.**

## 5. Pricing Lookup (srouter)

Data `open-sse/config/pricing-data/pricing.jsonc` + `open-sse/utils/pricing.js`.
`getModelPricing(id)` → `{ input, output }` per-1M USD or `null`.

## 6. RTK Filter Extensions (9router-v3 + ZenRouter)

Registered in `open-sse/rtk/registry.js`, auto-detected in `autodetect.js`:
`grep/ls/tree/smartTruncate/readNumbered` (baseline) +
`cargoTest/goTest/mypy/pytest/vitest/env/jsonCompact` (ZenRouter) +
TOML declarative engine (`tomlEngine.js` + `custom-filters/*.toml`:
brew/make/ps/systemctl/terraform).

## 7. QWEN OAuth + opencode-go Executor (9router-v3)

- QWEN device-code+PKCE flow (`src/lib/oauth/providers/qwen.js`, `QWEN_CONFIG`).
  NOTE: no `open-sse/providers/registry/qwen.js` yet — add for catalog integration.
- `opencode-go` executor registered as `"opencode-go"`.

## 8. Account Automation (9router-v3)

- `/api/automation/codebuddy` (+ `/:id`, `/debug-vnc`, `/test-proxy`) —
  bulk signup jobs. Tables: `codebuddyAccounts`, `codebuddyJobs`.
- `/api/automation/ammail` (+ `/otps/:id`, `/webhook`) — temp-mail OTP.
  Table: `ammailOtps`.
- `/api/automation/cloudflare-ai` — CF signup via Global API key.
- `src/lib/proxy-agentrouter/engine.js` — AgentRouter WAF-bypass reverse proxy
  (codex_cli_rs UA spoof + `acw_tc` refresh every 15 min).
- `/api/media-proxy` — trusted-domain CDN proxy (Google storage, weavy.ai).

## 9. Guardrails (OmniRoute, default OFF)

`src/lib/guardrails/` — `credentialMasker` (LLM/VCS/payment key patterns),
`piiMasker` (email/phone/IP/card), `promptInjection` (8 patterns + scorer).
Settings: `guardrailsEnabled` (default false), `guardrailMaskCredentials` (true),
`guardrailMaskPII` (false), `guardrailBlockInjection` (false).
Wired at top of `handleSingleModelChat`, fail-open.

## 10. Semantic Cache (OmniRoute, minimal)

`src/lib/semanticCache.js` — normalized exact-match + TTL (default 1h),
table `semanticCache`. API: `cacheGet(model, messages)` / `cacheSet(...)`.
Upgrade path: swap `normalize()` for embeddings + vector search.

## 11. Prompt Templates (OmniRoute, minimal)

CRUD at `/api/prompts` (GET list, POST `{name, content}`, DELETE `?id=`).
Table `promptTemplates`.

## 12. Reasoning Routing (OmniRoute, minimal)

`src/lib/reasoningRouting.js` — `resolveReasoningRoute(messages, rules)` matches
substring tags → `{ model, effort }`. Rules live in
`settings.reasoningRoutingRules`. Fail-open (`null` = keep model).

## 13. Quota Pools + Token Ledger (OmniRoute, minimal)

`/api/quota-pools` (GET list, POST `{name, description?, budgetTokens?}`).
Tables: `quotaPools`, `quotaAllocations`, `tokenLedger`.

## 14. Media Endpoints (OmniRoute, minimal)

- `POST /v1/rerank` — Cohere rerank pass-through (`{ model, query, documents[], top_n? }`, key via Authorization).
- `POST /v1/moderations` — OpenAI moderation pass-through.
- `POST /v1/ocr` — Mistral OCR pass-through (`{ model?, document }`).
- `POST /v1/music` — **501 stub** (donor flow needs credentials + polling; unwired).

## 15. models.dev Catalog Sync (OmniRoute, minimal)

`src/lib/modelsDevSync.js` — `fetchModelsDev()` (disk-cached),
`searchModelsDev(query)` → `[{ provider, id, name }]`.

## 16. Correctness Fixes (ZenRouter)

- Tool-name compressor (Gemini 64-char `INVALID_ARGUMENT` #3622) + response decloak.
- `thoughtSignature` toolCallIds, assistant-prefill policy, deferred-tool
  cache guard (#3567) in `formats/claude.js`.
- StreamMode fix (absent `stream` key = non-stream, #3492) via wholesale `chatCore.js`.
- Client-version/UA spoof registry (`open-sse/config/clientVersions.js`).
- Quota-aware selection module + settings keys (`quotaAwareSelection`,
  `quotaCacheTtlMs`, `quotaAwareProviders`). Full auth-loop integration deferred.
- Scheduler lifecycle hardening, request correlation IDs, cgroup-aware CLI
  memory flags (`cli/hooks/nodeFlags.js`), live-model fetcher.

---

## Port logs

