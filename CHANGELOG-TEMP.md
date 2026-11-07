# TEMP CHANGELOG — unversioned hotfixes

This file accumulates fixes that are pushed to papi **without a version revision**.
When the fix series is done, move these entries into `CHANGELOG.md`, bump
`package.json` once, tag the release, build the versioned image, and deploy it.
Delete this file after the final version is recorded.

Build convention: `gh workflow run docker-publish.yml --ref release/3.3.0`
publishes `ghcr.io/konaimav2/krouter9:sha-<short>` for the dispatch commit. The
app keeps the last released `/api/version` until the final revision.

---

## 2026-11-05 — P1 MITM accessibility + shared Badge tokens (unversioned)

- `src/shared/components/Badge.js`: status variants now use the semantic
  `--color-success/warning/danger/info` tokens and the documented 12% `*-wash`
  instead of raw Tailwind palette colors. Light warning contrast is 4.6:1,
  dark 9.49:1; success 4.91, danger 5.44, info 5.25.
- `src/app/(dashboard)/dashboard/cli-tools/components/MitmToolCard.js`: the
  tool-card header is a real `<button type="button">` with `aria-expanded` and
  `aria-controls` (useId panel id), phrasing spans, an `aria-hidden` chevron,
  and an empty image alt. Keyboard users can expand the MITM tool settings.
- CI: `docker-publish.yml` gains a `type=sha` tag on `workflow_dispatch`, so a
  hotfix image can be published without a version tag.
- Verification: Badge eslint 0; `antigravity-mitm` + `mitm-root-ca` 6/6;
  design-mcp header scan clean; `impeccable detect []`; the pre-existing
  `loadSavedMappings` lint error/warning in MitmToolCard is unchanged from
  v3.3.28. `/dashboard/mitm` still needs the full axe/ten-viewport matrix.
- Hotfix image: `ghcr.io/konaimav2/krouter9:sha-303c984`, digest
  `sha256:03ce267c63d8fa4799e69283e89cd19afc4f80b75a49f236ae1f33f53b33c9c6`.
- papi: hotfix digest above, `/api/version` remains **3.3.28** (no version
  revision), started `2026-11-05T05:09:43Z`, health 200; retention 48 h / 4 GB;
  `cloudflared-9router` and headroom StartedAt unchanged.
- QA on the exact hotfix image (InstaBox): the “DNS off” badge renders with
  `rgb(180,83,9)` on the 12% warning wash; the disclosure button toggles
  `aria-expanded` false→true→false with the panel visible at 1440/390 in light
  and dark; hScroll 0. axe: **0 critical, 1 serious `color-contrast`** on
  pre-existing MITM page text, not the badge: warning heading 4.34:1
  (`text-[var(--color-warning)]` on the warning wash), “Cert Trusted”
  `text-green-600` 2.9:1, and “Stop Server” `text-red-500` 2.98:1. Those three
  are queued as the next one-by-one fix; the badge/keyboard P1s pass.

## 2026-11-07 — Fast combo handoff and upstream reset ledger (unversioned)

- Classify nested Undici `UND_ERR_SOCKET` / `ECONNRESET`, `EPIPE`, and socket-hang-up
  failures while excluding AbortError/deadline abort, DNS errors, and timeouts.
- BaseExecutor now sends at most one request per base URL for a classified socket
  reset, then advances to another base URL or throws promptly; normal HTTP
  502/503/504 and unrelated network retry policies remain unchanged.
- A pre-header reset in a combo now cools the failing connection once and hands
  the 502 to the combo immediately, rather than rotating through every account
  for the same dead member. Standalone account rotation remains unchanged.
- Reset after HTTP/SSE commit never replays a second combo member; the existing
  client-format failure terminal is sent and the reset is recorded.
- Pre-header resets write `6_error.json`, `6_stream_termination.json`, and
  `errors.jsonl` metadata (provider/model/code/url index/duration); full prompts
  are not duplicated in error artifacts and URLs are credential-masked.
- Verification: 9 focused files / 54 tests pass after the final combo-probe change;
  ESLint clean. RED/GREEN integration uses the real
  `handleComboChat → handleSingleModelChat → handleChatCore → first-chunk probe` chain.
- QA box baseline (old image): four reset hits + about 9.5 seconds before member 2.
  Exact-image live proof (new image): upstream server recorded exactly one `model=reset`
  and one `model=healthy`; response 200 with member-2-only content and one `[DONE]`;
  gateway emitted exactly one `COMBO_RESET_HANDOFF`; durable reset ledger records written.
  Raw gateway lines and response are in `/tmp/live-reset-combo/` on the box. The helper
  summary’s reset counters are stale due to a regex expecting aliases; do not cite them.
- CI run `42269988460` success. Hotfix image
  `ghcr.io/konaimav2/krouter9:sha-916c2b7`, digest
  `sha256:e44603eedf63f810ca44299cfeeef3ac33ddc429b05ce051c333e72c69ee4648`.
- papi runs the digest above; `/api/version` remains **3.3.28**, health 200. Retention is
  48 h / 4 GB; `cloudflared-9router` untouched. Headroom was already exited (`137`,
  FinishedAt `2026-11-05T13:07:15Z`) before this swap; not restarted. No version revision.

## 2026-11-07 — Immediate combo handoff on upstream socket reset (unversioned)

- Shared classifier unwraps nested Undici cause codes for `ECONNRESET`,
  `EPIPE`, `UND_ERR_SOCKET`, and socket-hang-up, while excluding client/deadline
  aborts, DNS failures, and timeouts.
- A socket reset gets at most one fetch per base URL before URL/account fallback;
  HTTP 502/503/504 responses and unrelated thrown network failures retain their
  configured retry behavior.
- Pre-header reset inside a combo’s semantic SSE probe now writes durable
  `upstream_network_reset` error + termination records and returns a typed 502
  to the combo account loop. It cools the failing connection once and advances
  to the next combo member immediately. Post-header reset still emits the
  client-format failure terminal and never replays another member.
- Live baseline on the old QA image: 4 reset hits and ~9.5s before member 2.
  Exact hotfix image live fixture: one reset hit, one healthy hit, 200 member-2
  content, one `COMBO_RESET_HANDOFF`, and durable reset records. `run-reset-combo.sh`
  summary counters were stale (it expected `resetqa/reset`/`resetqa/healthy`, while
  the mock API receives `reset`/`healthy`); gateway log visibly shows the handoff and
  upstream log contains exactly one request for each. Current exact-image artifacts
  were removed with the disposable QA container; repeat the fixture if new evidence
  is needed. Do not cite the stale counter JSON.
- Unit proof: 9 focused suites / 54 tests in the final post-probe run; ESLint clean;
  RED/GREEN real-chain integration covers chatCore precommit probe reset.
- CI run `42269988460` success; papi image
  `ghcr.io/konaimav2/krouter9:sha-916c2b7`, digest
  `sha256:e44603eedf63f810ca44299cfeeef3ac33ddc429b05ce051c333e72c69ee4648`.
  `/api/version` remains 3.3.28; health 200. No version revision.

## 2026-11-07 — Do not truncate large account rotations at eight attempts (unversioned)

- Removed the fixed `ACCOUNT_ROTATION_MAX_ATTEMPTS=8` stop from the chat account
  rotation loop. `ACCOUNT_ROTATION_DEADLINE_MS` (75 seconds) remains the bounded
  request budget and still aborts an in-flight attempt / returns a retry-safe 504.
- RED/GREEN: a 12-account-shaped pool with 503s on accounts 1–9 and account 10
  healthy failed under the old cap (503) and succeeds after the change; separate
  test confirms the time deadline still stops rotation. No Codex plan eligibility
  rules were changed.
- Production snapshot: TokenHarbor 147 active (142 `testStatus=active`, 5
  unavailable); 39 historical errors include upstream 429s and 499 client/deadline
  aborts. Codex 8 active (6 free, 2 plus); all 8 received explicit 400
  `gpt-6.1-luna` unsupported, so Codex entitlement remains unchanged.
- Exact-image QA (`sha-75454fb`, image digest
  `sha256:8cec95b5b0c97a40664d1dcec90a8e93250bf9e9ccd8e51272a5532cbfc8412c`):
  100 seeded accounts, accounts 1–9 return 503, account 10 succeeds; 37 HTTP
  attempts across exactly the first 10 distinct accounts; response 200 with
  `eligible-account-10-reached`, one `[DONE]`. Fixture removed and 0 resetqa refs remain.
- Hotfix CI run `42337092560` success. Deployed to papi on 2026-11-07 as
  `ghcr.io/konaimav2/krouter9:sha-75454fb`, digest
  `sha256:8cec95b5b0c97a40664d1dcec90a8e93250bf9e9ccd8e51272a5532cbfc8412c`;
  `/api/version` remains 3.3.28, health 200. `cloudflared-9router` unchanged.
  Headroom was already exited 137 before the swap and was left untouched.
  Separate per-account HTTP retry pacing is unchanged.

## 2026-11-07 — Allow rotation through large eligible pools (unversioned)

- Removed the fixed `ACCOUNT_ROTATION_MAX_ATTEMPTS=8` cap from chat account
  rotation. `ACCOUNT_ROTATION_DEADLINE_MS` remains the overall bound and still
  produces a retry-safe 504 when time is exhausted. Per-account HTTP retries,
  429 cooldowns, and Codex entitlement filters are unchanged.
- RED/GREEN: old 8-attempt code returned 503 before account 10; fixed code
  reaches healthy account 10 after 503s on accounts 1–9. A separate advancing-
  clock test proves the 75-second deadline still stops rotation.
- Production snapshot: TokenHarbor 147 active; 39 historical model errors,
  mostly upstream 429s and 499s from deadline/client aborts. Codex has 8 active
  accounts (6 free / 2 plus); all had explicit upstream 400 unsupported-model
  errors for `gpt-6.1-luna`, so entitlement filtering was not changed.
- Exact-image QA: 100 disposable connections; 37 HTTP requests across accounts
  1–10 (normal per-account retry behavior preserved), account 10 success,
  HTTP 200, expected body, exactly one `[DONE]`. Fixture cleanup left zero test
  provider/connection/combo records.
- CI `42337092560` success. Hotfix deployed as
  `ghcr.io/konaimav2/krouter9:sha-75454fb`, digest
  `sha256:8cec95b5b0c97a40664d1dcec90a8e93250bf9e9ccd8e51272a5532cbfc8412c`.
  papi `/api/version` remains 3.3.28, health 200; cloudflared untouched.
- Follow-up: per-account HTTP retry pacing still costs about 6 seconds per 503
  account. That was not changed by this cap fix.
