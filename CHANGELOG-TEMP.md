# TEMP CHANGELOG — unversioned hotfixes

This file accumulates fixes that are pushed to papi **without a version revision**.
When the fix series is done, move these entries into `CHANGELOG.md`, bump
`package.json` once, tag the release, build the versioned image, and deploy it.
Delete this file after the final version is recorded.

Build convention: `gh workflow run docker-publish.yml --ref release/3.3.0`
publishes `ghcr.io/konaimav2/krouter9:sha-<short>` for the dispatch commit. The
app keeps the last released `/api/version` until the final revision.

---

**2026-11-10 — versions 3.3.1 through 3.3.28 are revoked as releases.** Their notes were
moved here from `CHANGELOG.md` unchanged in substance (headings demoted); the features and
code stay in the tree. `CHANGELOG.md` now ends its 3.3 line at v3.3.0. The next release will
fold everything below into one new version. Git tags `v3.3.1`–`v3.3.28`, `package.json`
(3.3.28) and the version papi reports were NOT changed by this move.

## Folded from CHANGELOG.md — former 3.3.1 … 3.3.28 (2026-11-02 … 2026-11-05)

### v3.3.28 (revoked as a version) (2026-11-05) — preserve upstream gateway status on exhausted fallback

- When an account pool is exhausted on 502/503/504, the client now receives that
  upstream status instead of a generic 503. Exhausted 429 pools keep the existing
  503 + reset-after behavior; non-gateway/no-status failures stay 503.
- A 504 HTML upstream now surfaces as HTTP 504 with a clean JSON error body while
  the request log and durable ledger record `HTTP 504` + the upstream body.
- Tests: 504/502/503 preservation, zero-attempt persisted status, and the
  unchanged 429/401 contracts. `cli/` stays 1.0.0.

### v3.3.27 (revoked as a version) (2026-11-05) — Stream termination + durable error ledger

- Premature upstream EOF (content arrived but no `finish_reason` / `[DONE]`) now
  writes a structured `stream_termination` record and emits a client-format
  failure terminal (OpenAI error + `[DONE]`, Claude `event: error`, Responses
  `response.failed` + `[DONE]`) instead of a silent truncation.
- Client disconnect/cancel and upstream network/error endings are logged with
  chunk/byte/duration stats. The append-only `errors.jsonl` ledger lives outside
  session dirs and survives request-log pruning.
- Upstream non-2xx and non-SSE HTML responses log status/body (HTTP 403, 504,
  5xx) to the request log and the durable ledger before returning.
- OpenAI passthrough no longer emits a duplicate `[DONE]` on normal completion.
- Production log retention can be raised with `REQUEST_LOG_RETENTION_HOURS=48`
  and `REQUEST_LOG_MAX_BYTES=4294967296`; `/app/logs` is a persistent mount so
  container swaps do not discard request traces. `cli/` stays 1.0.0.

### v3.3.26 (revoked as a version) (2026-11-04) — Quota pagination target fix (supersedes 3.3.25)

- Quota page Previous/Next pagination buttons no longer flex-shrink below 44px at
  390px width (`shrink-0` on the pager controls). Measured 42x44 before; the plan
  requires >=44x44.

Evidence-only wave also reopens the E3 network-namespace capture, full C3
strategy/binding retry traces, E8 raw persisted arrays, and the G/T gate
artifacts. Tags never move; `cli/` stays 1.0.0.

### v3.3.25 (revoked as a version) (2026-11-04) — Final contrast pass (supersedes 3.3.24)

- Badge error variant to red-700 for the light surface.
- Connection error text and Delete get explicit dark:text-red-400 so the dark
  theme does not inherit the darker red.

Colour-only diff; behaviour evidence on 3.3.24 carries over, accessibility
and viewport evidence re-run on this digest. Tags never move; `cli/` stays 1.0.0.

### v3.3.24 (revoked as a version) (2026-11-04) — Model-row names, connection contrast (supersedes 3.3.23)

- `ModelRow` icon-only Test/Copy/Remove/Disable buttons get accessible names
  (the remaining axe `button-name` critical on the provider page).
- `ConnectionRow` error text and Delete label move to red-700 for AA on the light surface.

3.3.23 was probed but superseded before deployment; tags never move. `cli/` stays 1.0.0.

### v3.3.23 (revoked as a version) (2026-11-04) — Accessibility follow-up (supersedes 3.3.22)

- Name the provider-page connection reorder buttons (the remaining axe `button-name`
  critical was `ConnectionRow`, not the media-provider card).
- Raise the success badge to green-800 and the connection error/delete text to red-700;
  axe still measured those light-theme nodes below AA at the previous step.
- Give the basic-chat load-error box `role="alert"` so the failed-read case exposes a
  visible error to assistive tech and to the QA checker.

3.3.22 was probed but superseded before deployment; tags are never moved. `cli/` stays 1.0.0.

### v3.3.22 (revoked as a version) (2026-11-03) — Failed-save honesty, failed-read errors, accessibility

#### Why
Live QA on the 3.3.21 candidate found the provider detail page still ignored failed strategy
and binding saves (it does not use `ConnectionsCard`), five pages rendered failed reads as
empty states, three more save controls ignored non-2xx, and axe measured critical/serious
accessibility defects on the provider surfaces.

#### Provider saves
- `providers/[id]/page.js`: strategy GET/PATCH checked, `role="alert"`, persisted value reloaded
  on failure; the connection proxy dropdown PUT checked with a connection-list reload on failure.
- `ConnectionsCard` (media providers) keeps the 3.3.21 honesty fix.

#### Failed reads and writes
- Endpoint: a failed GET `/api/keys` no longer auto-creates `Default Key`; inline alert + Retry.
- Quota: a failed connections fetch shows an alert + Retry instead of `No Providers Connected`.
- Basic chat: non-2xx provider load shows a distinct error + Retry, not the empty state.
- Combos: empty state suppressed while the fetch error is shown; capacity-adapter and
  combo-strategy PATCHes check status, alert, and keep/reload the previous value.
- CLI tools: `all-statuses` failure shows an alert + Retry.
- Token Saver: RTK PATCH checks status, alerts, and keeps the prior value.

#### Accessibility (FR-11)
- Accessible names on connection reorder buttons and connection checkboxes.
- Contrast: success badge (green-700), connection error text (red-600), risk notice (red-700).
- 44px targets: quota pagination, quota edit/delete, CLI setup link. The 44x24 strategy switch
  stays as-is (passes WCAG 2.5.8 24px AA; the plan's 44px list names pagination/quota/translator/
  wizard controls).

#### Notes
- `v3.3.21` (digest `sha256:8dbdf261…2a85`) was built and probed, then superseded before any
  deployment; tags are never moved. `cli/` stays 1.0.0.
- Evidence: `/tmp/opencode/kr9_qa/instabox-3321/` and `labs/wave-3.3.21/EVIDENCE.md`.

### v3.3.21 (revoked as a version) (2026-11-03) — Bound egress refuses direct; save honesty

#### Proxy egress (FR-3)
- A bound free lane whose pool proxy fails now returns HTTP 503 naming the pool and the masked
  proxy endpoint ("Refusing direct egress") instead of silently retrying the request directly.
  Live repro on 3.3.20: a dead existing pool logged `[ProxyFetch] Proxy failed, falling back to
  direct`, opened a real connection to opencode.ai:443, and returned the upstream 429
- The strict flag and pool name now travel from `resolveConnectionProxyConfig` through `auth.js`
  and `chatCore` to `proxyFetch`; a free-lane binding is always strict, regardless of the pool
  checkbox. Non-strict pools keep the documented direct fallback
- `tests/unit/proxy-strict-refusal.test.js` runs a local upstream plus a dead proxy: strict
  rejects with `PROXY_STRICT_FAILED`/503 and no direct success, non-strict still falls back (2/2)

#### Provider strategy and binding saves (FR-10)
- `ConnectionsCard` checks the GET and PATCH responses for strategy saves, shows a `role="alert"`,
  and re-reads server state on failure; the proxy-binding PUT does the same instead of leaving
  an optimistic value
- The no-auth proxy binding card already reported failed saves and re-read persisted state; no
  change needed there

#### Notes
- `cli/` stays 1.0.0; tags are never moved
- RED proof: `/tmp/opencode/kr9_qa/instabox-3321/fr10-strategy-red/probe.json`

### v3.3.20 (revoked as a version) (2026-11-03) — Emails toggle and page-size target

#### Dashboard (FR-11)
- The quota "Show account emails" control now measures 44x44 (was 36x32); the previous patch
  hit an adjacent button with the same class string
- The "Accounts per page" select is 44 px high

#### Notes
- `cli/` stays 1.0.0; tags are never moved

### v3.3.19 (revoked as a version) (2026-11-03) — 44px targets on the named controls (FR-11)

#### Dashboard
- Quota row "Hide quota" controls: 24 -> 44 px
- Quota row icons: show/hide account emails, auto-ping, refresh quota, Codex reset credit and
  reset-credit expiry: 32-36 -> 44 px
- Translator "Load" action and the six load-source icon buttons: 32/40 -> 44 px
- Pagination was not present in the QA fixture (single page), so it is recorded as unmeasured,
  not claimed

#### Notes
- Measured with `getBoundingClientRect()` in the browser on 3.3.19, not inferred from classes
- `cli/` stays 1.0.0; tags are never moved

### v3.3.18 (revoked as a version) (2026-11-03) — Mutations fail honestly (FR-10)

#### Dashboard
- Provider toggles check the response status. A failed bulk toggle restores the previous
  connection states and shows a `role="alert"` with the provider and the HTTP failure instead
  of leaving the optimistic switch on
- Console-log clear checks the response status. A failed clear keeps the retained lines, closes
  the confirm dialog, and shows a `role="alert"` saying the lines were not deleted

#### Notes
- Found by the FR-10 mutation matrix, not by source reading: both handlers previously ignored
  `res.ok`, so an HTTP 500 looked like a successful save
- `cli/` stays 1.0.0; tags are never moved

### v3.3.17 (revoked as a version) (2026-11-03) — Light-theme text contrast closeout

#### Dashboard (FR-11)
- Combos and Playground secondary labels use the muted text token instead of the lighter
  subtle token, which measured 3.09:1 on the light canvas
- The quota bulk actions use semantic danger/success tokens, replacing red-500 (3.46:1) and
  emerald-500 (2.25:1) on the light canvas
- The quota connection secondary label drops the 80% opacity that measured 3.69:1
- Console-log time and source columns use the rail-muted token, which is readable on the
  intentionally dark log surface in both themes

#### Notes
- `cli/` stays 1.0.0; tags are never moved
- Surface audit after this patch: 15 routes x 2 viewports, 0 console errors, 0 overflow;
  axe light/dark 0 serious/critical on all 15 routes

### v3.3.16 (revoked as a version) (2026-11-03) — Theme-correct contrast on the remaining surfaces

#### Dashboard (FR-11)
- Quota status uses the semantic `success`/`warning`/`danger` tokens (both themes) instead of
  fixed Tailwind greens/yellows/reds; the 10 px percentage text and meter fills now meet
  contrast on the light and dark canvases
- Inactive quota rows are tinted instead of dimmed at 60% opacity, so their text keeps its
  contrast while the row still reads as inactive
- The Shutdown utility uses a rail-safe danger token (`--color-rail-danger`); the light-theme
  rose-700 was 2.95:1 on the dark rail
- The "Auto-detect all applications" action uses `--color-on-primary` instead of hard-coded
  white, fixing 1.74:1 white-on-glacier in dark mode
- Usage topology fallback initials use the theme text token instead of `#6b7280` (3.78:1 on the
  dark node)
- The setup-wizard command block is keyboard-focusable and labelled

#### Notes
- `cli/` stays 1.0.0; tags are never moved
- Verified by the surface audit, not by the class names: 15 routes x light/dark axe, 0 critical /
  0 serious except the items above before this patch

### v3.3.15 (revoked as a version) (2026-11-03) — Full-surface accessibility and grammar pass

#### Dashboard (FR-10, FR-11)
- Quota status is text and colour only: the 🟢🟡🔴 glyphs in the progress bar, table and
  helper are removed (FR-10 bans quota-status emoji)
- Every switch exposes an accessible name. `Toggle` accepts `ariaLabel` and falls back to the
  visible `label` or the icon-row `title`, so no `role="switch"` renders unnamed
- `Input` associates its visible label with the control through `htmlFor`/`id` (`useId`),
  fixing the four unlabelled observability number fields
- `.command-utility` and the gateway version label use readable rail/text tokens instead of
  the low-contrast muted tokens
- The usage breakdown scroll container and the CLI command blocks are keyboard-focusable
  (`tabIndex=0`, labelled region)
- `jina-reader-free` maps to the packaged `jina-reader.png`, removing the Media 404
- Usage zero-cost copy reads `no cost was measured`

#### Tests
- `toggle-input-a11y-render.test.js` renders the real components: switch names from
  ariaLabel/label/title/default and Input label-to-id association, including a caller id (6/6)
- `quota-no-status-emoji.test.js` source guard for all three quota modules (3/3)
- `provider-icon-custom-id.test.js` covers the Jina alias (4/4)
- Full suite 3186 passed / 96 known fails / 6 known suite fails; comparator reports no regression

#### Notes
- `cli/` stays 1.0.0; tags are never moved

### v3.3.14 (revoked as a version) (2026-11-03) — Test lint cleanup

#### Tests
- Rename the render-test module shim from `module` to `mod` so the Next ESLint rule
  `@next/next/no-assign-module-variable` passes. No application code change from 3.3.13
- `tests/unit/apikey-select-render.test.js` 2/2 and ESLint 0

#### Notes
- Patch bump only because v3.3.13 is already published; tags are never moved

### v3.3.13 (revoked as a version) (2026-11-03) — Fix the key selector render crash from 3.3.12

#### CLI Tools (FR-2)
- 3.3.12 removed the `useEffect` import from `ApiKeySelect.js` while the component still
  subscribes to saved key presets in an effect. Any surface that rendered the selector threw
  `ReferenceError: useEffect is not defined`. The import is restored
- Found by an adversarial render check, not by the source-string contract test. The new
  `tests/unit/apikey-select-render.test.js` mounts the component through the real React
  renderer and would fail with that exact error; it passes now (2/2), and fails if the import
  is removed (mutation-checked)

#### Notes
- The no-auto-reveal behavior from 3.3.12 is unchanged: placeholder start, explicit selection
  only, no fallback reveal on preset delete
- `cli/` stays 1.0.0

### v3.3.12 (revoked as a version) (2026-11-03) — API keys reveal only on explicit selection

#### CLI Tools (FR-2)
- `ApiKeySelect` no longer resolves and passes a raw key on mount. The control starts with
  `Select a key…`, and a secret is fetched only when the user picks a key from the list
- Deleting a saved key preset no longer auto-reveals a different key; the selection is cleared
  and the user picks again
- The selector still resolves exactly one key id through the guarded single-record endpoint;
  list payloads keep carrying `maskedKey` only
- Contract test `tests/unit/apikey-select-confirm-reveal.test.js` (4/4) pins the no-auto-reveal
  rule, the single call site, and the placeholder state

#### Evidence additions
- Token Saver counters are compared with `/api/headroom/proxy/stats` in the browser
  (`MATCH before=19,832 saved=11,030`)
- The Claude Code configured-client run now uses the exact rendered wizard snippet
  `export ANTHROPIC_BASE_URL="http://127.0.0.1:20129/v1"`

#### Notes
- Security-flow fix; no API or data change. `cli/` stays 1.0.0

### v3.3.11 (revoked as a version) (2026-11-03) — Wizard content fits narrow screens

#### CLI Tools (FR-1/FR-11)
- Scan results and the `Scanned:` targets no longer force a ~506 px minimum width on phones.
  Long paths wrap (`break-all`), the two status lines break words, and the three wizard steps
  are allowed to shrink (`min-w-0`)
- Fixes the horizontal shift that appeared after using the `Open <tool> setup` anchor on a
  360–414 px viewport: the anchor scrolled a too-wide wizard column and pushed the page header
  off the left edge

#### QA tooling
- The InstaBox overflow check now ignores elements clipped inside a horizontally scrollable
  strip and still measures the strip itself, matching the intentionally-scrollable exception

#### Notes
- Found by post-step measurement on the real page, not the login page; no data or API change

### v3.3.10 (revoked as a version) (2026-11-03) — Judge findings: failed scans and failed stats reads

#### CLI Tools (FR-1)
- A scan that returns a non-OK response or throws now shows `Scan failed (HTTP n)` /
  `Scan failed: <reason>` and keeps the results list hidden. It never renders
  "Scan Results (0 detected)" for a request that failed

#### Token Saver (FR-4)
- A failed PXPIPE fallback statistics read is now an error (`stats unavailable`), not
  "Awaiting measured traffic". Only a reachable service with zero traffic says awaiting

#### QA baseline (FR-11)
- `tests/__baseline__/known-failed-suites.txt` plus the comparator now account for
  suite-level collection failures (six known, unchanged since 3.3.3). A new suite failure
  fails the gate instead of being reported after the assertion count

#### QA tooling
- InstaBox `qa.mjs` now measures overflow and takes the viewport screenshot after the
  step sequence, so ten-viewport geometry claims describe the page the steps reached,
  not the pre-login landing page

#### Notes
- No routing, provider, combo or auth change

### v3.3.9 (revoked as a version) (2026-11-03) — No stats call while Headroom is known down

#### Token Saver
- The savings effect is gated on the status probe. While Headroom is unreachable the page no
  longer calls the stats route, so the down state shows the error row without a guaranteed 500
  in the browser console. When the service comes back the numbers load without a page reload
- A running service with zero traffic still reads "Awaiting measured traffic" from 3.3.8

#### Notes
- Final truthfulness pass on the FR-9 stop/start cycle; no routing or setup change

### v3.3.8 (revoked as a version) (2026-11-03) — A quiet service is not a broken one

#### Token Saver
- When Headroom answers but has no measured traffic yet, the Output compression row now says
  **Awaiting measured traffic** instead of the red **stats unavailable**. Only a failed request
  is an error; a healthy service with zero requests is not
- Found in the FR-9 stop/start cycle: restarting the sidecar clears its in-memory counters and
  the row was mislabelled until real traffic arrived

#### Notes
- Contract test extended to pin both the error and the empty state

### v3.3.7 (revoked as a version) (2026-11-03) — No 404s for custom-provider logos

#### Usage / Providers
- Custom connections use generated UUID ids and never ship a logo file. The icon resolver
  now returns no image for those ids and renders the existing text fallback, so the usage
  page no longer issues guaranteed-404 requests (five console errors in the QA snapshot)
- Known providers keep their packaged logos; the one-time missing-icon cache is unchanged

#### Notes
- Found by the InstaBox console-error gate on 3.3.6. No functional change to routing,
  token saving or the CLI wizard

### v3.3.6 (revoked as a version) (2026-11-03) — FR-1 auto-detect, honest stage toggles, FR-9 scope record

#### CLI Tools (FR-1)
- Step 1 is now **Auto-detect**: one button scans Cursor, Codex, Cline, Roo, OpenCode,
  OpenClaw, Hermes and VS Code with read-only path and `which` probes, and lists each result
  as Detected, Not found, or Check failed. Clicking a result selects the client and moves to
  the status step; the manual search/select path stays
- Per-client `Scanned:` targets now include Cursor, Roo and VS Code
- Detection is read-only, user-scope only, and a thrown probe is never reported as "not found"

#### Token Saver (FR-4)
- Stage toggles no longer show an enabled state the server did not persist: the settings
  write is checked, a failure reverts the control, and the page shows `Settings not saved: …`
- Applies to Caveman, Ponytail, Headroom, PXPIPE and the Headroom URL / timeout fields

#### FR-9 scope
- Owner decision recorded in `labs/wave-3.3.0/SCOPE-DECISIONS.md`: Headroom stays host-managed
  with a published image and a single run command; no Docker socket or socket proxy is exposed
  to the gateway. The dashboard keeps real state and measured evidence, and managed
  start/stop stays local-binary only

#### Notes
- 3.3.5 passed QA but was not deployed; this release carries the FR-1 and FR-4 fixes
- `cli/` stays 1.0.0

### v3.3.5 (revoked as a version) (2026-11-02) — No install prompt while Headroom is running

#### Token Saver
- The managed-install command is hidden once the service is reachable, so a running service
  never receives a static setup prompt in either mode: local managed install or published
  container. Only the live service state and measured evidence remain
- Contract test extended to pin both the Complete state and the hidden prompt

#### Notes
- 3.3.4 passed QA but was not deployed. This is a one-line truth fix found in the QA notes

### v3.3.4 (revoked as a version) (2026-11-02) — Dual-stack Headroom and install-state fixes

#### Token Saver
- The Headroom proxy now tries every validated address (IPv6 first, IPv4 next) instead of
  pinning the first answer. On hosts where `localhost` resolves to `::1` and the sidecar is
  published only on `127.0.0.1`, the savings row showed "stats unavailable" and the service
  looked unreachable. Both are fixed, with a dual-stack regression test
- The install step reads **Complete** as soon as the service is reachable, even when the
  gateway has no local Python or headroom binary (container mode). The "Approval required"
  recovery text no longer appears while a service is running

#### Notes
- Caught by the 3.3.3 QA gate before deployment. 3.3.3 was built but never shipped
- The pinned-address security property is unchanged: the socket still never re-resolves the
  hostname; it only chooses among the addresses that were validated

### v3.3.3 (revoked as a version) (2026-11-02) — Judge fixes: pinned DNS, per-stage evidence, published Headroom image

#### Security
- The Headroom proxy now validates DNS once and pins that address into the socket lookup.
  A second resolution can no longer redirect the request to a public or metadata address
  (`src/lib/headroom/pinnedRequest.js`, 6 tests including a hostname that never resolves)

#### Token Saver
- Savings evidence is per stage: PXPIPE (measured from `/api/pxpipe/status`), Output
  compression (measured Headroom totals), Caveman and Ponytail (enabled state, explicitly
  "not measured per request"). A failed stage shows its own error and never blanks the panel
- A running Headroom service no longer shows the container setup prompt

#### CLI Tools
- The setup wizard lists the exact binaries and files each status check reads
- Every installed-client row has an anchor, and the wizard links straight to its setup card
  with the existing Apply / model search / clear controls

#### Headroom deployment
- The proxy image is published at `ghcr.io/konaimav2/headroom:0.42.0` by a dedicated CI workflow
- Setup is one `docker run`; there is no Dockerfile to write by hand. The pinned command keeps
  loopback-only publishing and the container bind acknowledgement

#### Notes
- `cli/` stays 1.0.0
- FR-5 remains deferred to the next release
- `/api/usage/chart` still ignores `startDate`/`endDate`; tracked for 3.3.4

### v3.3.2 (revoked as a version) (2026-11-02) — No invented setup snippet

#### CLI setup wizard
- A client that declares neither copyable `guideSteps` values nor `envVars.baseUrl` (Codex) now
  shows "No copy-paste snippet is declared for this client." instead of a borrowed Claude
  `ANTHROPIC_BASE_URL` export. The wizard only prints what the catalog declares
- Copy is disabled while the gateway origin is unresolved or no snippet is declared
- Contract tests updated (9 cases)

### v3.3.1 (revoked as a version) (2026-11-02) — Setup wizard fixes caught in 3.3.0 QA

#### CLI setup wizard
- Snippets now come from the catalog's `guideSteps`. 3.3.0 read a `steps` key that no tool
  defines, so every client rendered Claude's `ANTHROPIC_BASE_URL` fallback instead of its own
  command
- Detection uses the status payload's `installed` flag: `installed: false` is **absent**, a
  `null` entry (the getter threw) is **check-failed**, and a missing entry is **unavailable**.
  3.3.0 reported **detected** whenever any object came back, so an uninstalled Codex showed as
  detected
- The gateway origin is resolved with `useSyncExternalStore`, so the server and first client
  render agree. This removes the React #418 hydration text mismatch on the CLI Tools page
- Contract tests updated to these semantics (9 cases)

#### Notes
- Found by the 3.3.0 QA gate before any deployment. 3.3.0's image was built but never shipped.
- Known, not fixed here: `/api/usage/chart` ignores `startDate`/`endDate`, so the usage trend is
  not range-scoped. Tracked for 3.3.2.

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

## 2026-11-10 — Combo Manage route: single panel, inline member edit, save closes (unversioned)

- `src/app/(dashboard)/dashboard/combos/page.js`: only one Manage route panel is open at a
  time (page-level `openComboId`). A displayed member ID is a button that opens its inline
  editor (edit icon kept). Save route applies an open member field and closes the panel only on
  success; a failed or rejected save keeps it open with an inline alert; Cancel discards and
  closes. While a member field is open, Move/Remove/drag/second edit/Add model are locked, and
  edits are refused while the add-model picker is open (a stale edit index corrupted the saved
  route in testing). Phone widths: action icons wrap under the ID, the edit input gets its own
  line, and icon buttons stay 44x44 (`IconButton` is `shrink-0`). No API, persistence or
  strategy change.
- Tests: `tests/unit/wave-d-ui.test.js` gains RED-first coverage (controlled panel, direct edit,
  save-while-editing, success close, failure retention, cancel, mobile classes, the three
  stale-index repros, picker lock). Focused set (wave-d-ui, combo-rename,
  combo-resolution-order, combo-fallback-order) 43/43; eslint 0; oxlint only 4 old warnings.
- Browser QA (InstaBox, `next dev --webpack`, seeded multi-member fixture): 13/13 assertions and
  11/11 viewports pass, evidence `/root/temp/instabox/qa/evidence/combos-manage-route-20261107-r5/`.
  Judge (fable) PASS in round 3 after two send-backs.
- Baseline: full suite has no failure attributable to this change; the 47 failing files are the
  same set at clean HEAD (one order-dependent flaky `cursor-models` case aside). Known backlog:
  hidden dirty draft survives a panel switch, a slow save can close another combo's panel,
  edits during an in-flight save are dropped, footer Save/Cancel buttons are 32px tall.
- CI `42758552466` success. Hotfix deployed as `ghcr.io/konaimav2/krouter9:sha-c711f25`,
  digest `sha256:7819b1b55f4f63c4949c6432b8c5128c6cfa5d1f5f45e773acf5c2f03b2000f7`
  (swap script `/root/papi-swap-hotfix-c711f25.sh` on papi, log in `/root/papi-swap-hotfix-c711f25/`).
  papi `/api/version` remains 3.3.28, health 200, started `2026-11-10T04:55:59Z`;
  `cloudflared-9router` and `headroom` StartedAt unchanged (headroom has been exited since
  2026-11-05). Rollback image: `sha-75454fb`, `sha256:8cec95b5…`.
