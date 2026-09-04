# PORT_SROUTER_V3.md — srouter + 9router-v3 → KRouter9

## Landed (9router-v3)
1. QWEN OAuth (device_code+PKCE) — src/lib/oauth/providers/qwen.js + QWEN_CONFIG + index registration. NOTE: no open-sse registry entry yet.
2. opencode-go executor — open-sse/executors/opencode-go.js + index map + export.
3. ammail OTP automation (3 routes: main/otps/[id]/webhook) — TS→JS stripped, node --check clean.
4. media-proxy route — ported, clean.
5. AgentRouter WAF-bypass engine — src/lib/proxy-agentrouter/engine.js, clean.
6. codebuddy automation (4 routes: main/[id]/debug-vnc/test-proxy) — ported, fixed type-strip glitch (username: user).
7. Cloudflare signup automation route — ported, clean.
8. DB tables codebuddyAccounts/codebuddyJobs/ammailOtps in schema.js + SCHEMA_VERSION 1→2.

## TODO (srouter batch — not started)
- credit accounting, circuit breaker, fallback CRUD, rate/body limits, pricing
## TODO (OmniRoute batch — not started)
- semantic cache, prompt cache, guardrails, reasoning routing, quota pools, media superset, modelsDevSync

## Landed (srouter)
9. Circuit breaker (ported TS→JS) — open-sse/utils/circuitBreaker.js, wired recordSuccess/recordFailure in src/sse/handlers/chat.js fallback loop (provider/model granularity).

## Landed (srouter) — by hand
10. Fallback rules CRUD — fallbackRules table + /api/settings/fallbacks + /:id routes.
11. Credit accounting — apiKeys columns (rateLimit/quotaLimit/usageTokens/creditLimit/usageCost/allowedModels) + /api/keys/:id/credit GET/POST + usageRepo deduction hook.
12. Rate limiter — src/lib/rateLimit.js (fixed-window per key+IP). NOTE: not yet enforced in chat handler — wire at test time.
13. Body limit — src/lib/bodyLimit.js (25MB Content-Length guard). NOTE: not yet enforced — wire at test time.
14. Pricing — open-sse/config/pricing-data/pricing.jsonc + open-sse/utils/pricing.js lookup.
