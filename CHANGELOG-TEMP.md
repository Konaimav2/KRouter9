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
- Verification: 11 focused files / 76 tests pass; ESLint clean. RED/GREEN
  integration uses real `handleComboChat → handleSingleModelChat → handleChatCore`.
- QA box old-image baseline: before handoff, fixture produced 4 reset fetches
  plus ~9.5s before healthy member success. Patch exact-image proof pending.
- Hotfix image: _pending_ (tag convention `sha-<short>`; app version stays 3.3.28)
- papi digest: _pending_
