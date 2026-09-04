# PORT_ZENROUTER.md — ZenRouter → KRouter9

## Landed
1. RTK TOML engine + 5 custom-filters (*.toml brew/make/ps/systemctl/terraform) — copied, wired into autodetect.js (loadTomlFilters/applyTomlFilter)
2. 8 dev-output RTK filters (cargoTest/goTest/mypy/pytest/vitest/env/jsonCompact/truncate) — copied + registered in registry.js + FILTERS constants + autodetect json/env branches
3. RTK constants (CAP_WARNINGS, CAP_LIST, MAX_PYTEST_FAILURES, MAX_XFAIL, CARGO_FAILURE_TRUNCATE) — added to constants.js
4. toolCompressor (Gemini 64-char fix #3622) — copied, wired in translator/index.js request + response decloak
5. toolSchemaCompatibility — copied (used by donor chatCore, came along with wholesale chatCore.js)
6. thoughtSignature + assistantPrefillPolicy concerns — copied, wired via wholesale translator files
7. streamMode fix (#3492) — via wholesale open-sse/handlers/chatCore.js (clientRequestedStreaming)
8. Wholesale superset files from donor (same lineage, verified superset): open-sse/translator/request/openai-to-gemini.js, antigravity-to-openai.js, response/gemini-to-openai.js, formats/claude.js (deferred-tool guard #3567 + prefill), handlers/chatCore.js
9. clientVersions.js — copied (UA registry; provider wiring deferred, file present)
10. quotaAwareSelection.js — copied + settings keys (quotaAwareSelection/quotaCacheTtlMs/quotaAwareProviders) in settingsRepo.js. Full auth.js rewire SKIPPED (donor auth has per-provider mutex refactor, too invasive — file present for later)
11. schedulerLifecycle.js, requestCorrelation.js, cli/hooks/nodeFlags.js, providerLiveModels.js — copied, unwired (util files, no boot impact)

## Skipped (why)
- auth.js wholesale (per-provider mutex + quota snapshot refactor — risk of breaking fallback loop; defer to testing phase)
- settings route allowlist additions for new keys (settings API may whitelist keys — check at test time)
