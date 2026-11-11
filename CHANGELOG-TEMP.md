# TEMP CHANGELOG — unversioned changes

This file collects changes that are in the tree but not yet part of a numbered release.
When the next release is cut, these entries move into `CHANGELOG.md` under one new
version and this file is removed.

---

## Unreleased — dashboard accessibility and reliability pass (2026-11-11)

- API keys stay masked everywhere in the dashboard (CLI tool cards, media examples, MITM) and are
  fetched only when you click Copy, Apply, Run or Start. Old saved key presets in the browser are
  converted to masked labels on load.
- Pages that fail to load now say so, with a Retry button, instead of showing an empty list.
- The gateway address shown in setup snippets follows the address you opened the dashboard on,
  not a fixed port.
- Pricing moved under Settings; the sidebar, breadcrumbs, 404 page and "Add provider" flow were
  fixed so every page is reachable.
- Touch targets are at least 44px, scrollable tables are keyboard-focusable, icon buttons have
  names, and low-contrast text on the landing page and code blocks was fixed. Missing theme colors
  that rendered as transparent now exist. Landing and media-tab icons that showed an error glyph
  now show the intended icon.

**2026-11-10 — versions 3.3.1 through 3.3.28 are revoked as releases.** Their notes are
folded below into one unreleased batch, pending the next release; the features and code
stay in the tree. `CHANGELOG.md` ends its 3.3 line at v3.3.0.

## Folded from CHANGELOG.md — former 3.3.1 … 3.3.28 (2026-11-02 … 2026-11-05)

### v3.3.28 (revoked as a version) (2026-11-05) — preserve upstream gateway status on exhausted fallback

- When an account pool is exhausted on 502/503/504, the client now receives that
  upstream status instead of a generic 503. Exhausted 429 pools keep the existing
  503 + reset-after behavior; non-gateway/no-status failures stay 503.
- A 504 HTML upstream now surfaces as HTTP 504 with a clean JSON error body while
  the request log and durable error ledger record `HTTP 504` + the upstream body.
- Tests added for 502/503/504 preservation, zero-attempt pool exhaustion, and the
  unchanged 429/401 contracts.

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
- Log retention can be raised with `REQUEST_LOG_RETENTION_HOURS` (default 24) and
  `REQUEST_LOG_MAX_BYTES` (default 2 GB). In a container, keep the logs directory
  (`<cwd>/logs`, or `REQUEST_LOG_DIR`) on a persistent volume so container
  replacements do not discard request traces.

### v3.3.26 (revoked as a version) (2026-11-04) — Quota pagination target fix

- Quota page Previous/Next pagination buttons no longer flex-shrink below 44px at
  390px width (`shrink-0` on the pager controls).

### v3.3.25 (revoked as a version) (2026-11-04) — Final contrast pass

- Badge error variant to red-700 for the light surface (later replaced by the semantic
  `--color-danger` token; see 2026-11-05 below).
- Connection error text and Delete get explicit dark:text-red-400 so the dark
  theme does not inherit the darker red.

### v3.3.24 (revoked as a version) (2026-11-04) — Model-row names, connection contrast

- `ModelRow` icon-only Test/Copy/Remove/Disable buttons get accessible names.
- `ConnectionRow` error text and Delete label move to red-700 for AA on the light surface.

### v3.3.23 (revoked as a version) (2026-11-04) — Accessibility follow-up

- Name the provider-page connection reorder buttons in `ConnectionRow`.
- Raise the success badge to green-800 and the connection error/delete text to red-700
  for AA contrast on the light theme (the badge later moved to the semantic
  `--color-success` token; see 2026-11-05 below).
- Give the basic-chat load-error box `role="alert"` so a failed read is announced to
  assistive tech.

### v3.3.22 (revoked as a version) (2026-11-03) — Failed-save honesty, failed-read errors, accessibility

#### Why
The provider detail page still ignored failed strategy and binding saves (it does not use
`ConnectionsCard`), five pages rendered failed reads as empty states, three more save
controls ignored non-2xx responses, and the provider surfaces had accessibility defects.

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

#### Accessibility
- Accessible names on connection reorder buttons and connection checkboxes.
- Contrast: success badge (green-700), connection error text (red-600), risk notice (red-700).
- 44px targets: quota pagination, quota edit/delete, CLI setup link. The 44x24 strategy switch
  stays as-is (passes the WCAG 2.5.8 24px AA minimum).

### v3.3.21 (revoked as a version) (2026-11-03) — Bound egress refuses direct; save honesty

#### Proxy egress
- A bound free lane whose pool proxy fails now returns HTTP 503 naming the pool and the masked
  proxy endpoint ("Refusing direct egress") instead of silently retrying the request directly
  and reaching the upstream from the host's own address.
- The strict flag and pool name now travel from `resolveConnectionProxyConfig` through `auth.js`
  and `chatCore` to `proxyFetch`; a free-lane binding is always strict, regardless of the pool
  checkbox. Non-strict pools keep the documented direct fallback.
- `tests/unit/proxy-strict-refusal.test.js` runs a local upstream plus a dead proxy: strict
  rejects with `PROXY_STRICT_FAILED`/503 and no direct success; non-strict still falls back.

#### Provider strategy and binding saves
- `ConnectionsCard` checks the GET and PATCH responses for strategy saves, shows a `role="alert"`,
  and re-reads server state on failure; the proxy-binding PUT does the same instead of leaving
  an optimistic value.
- The no-auth proxy binding card already reported failed saves and re-read persisted state; no
  change needed there.

### v3.3.20 (revoked as a version) (2026-11-03) — Emails toggle and page-size target

#### Dashboard
- The quota "Show account emails" control now measures 44x44 (was 36x32).
- The "Accounts per page" select is 44 px high.

### v3.3.19 (revoked as a version) (2026-11-03) — 44px targets on the named controls

#### Dashboard
- Quota row "Hide quota" controls: 24 -> 44 px.
- Quota row icons: show/hide account emails, auto-ping, refresh quota, Codex reset credit and
  reset-credit expiry: 32-36 -> 44 px.
- Translator "Load" action and the six load-source icon buttons: 32/40 -> 44 px.

### v3.3.18 (revoked as a version) (2026-11-03) — Mutations fail honestly

#### Dashboard
- Provider toggles check the response status. A failed bulk toggle restores the previous
  connection states and shows a `role="alert"` with the provider and the HTTP failure instead
  of leaving the optimistic switch on.
- Console-log clear checks the response status. A failed clear keeps the retained lines, closes
  the confirm dialog, and shows a `role="alert"` saying the lines were not deleted.
- Both handlers previously ignored `res.ok`, so an HTTP 500 looked like a successful save.

### v3.3.17 (revoked as a version) (2026-11-03) — Light-theme text contrast closeout

#### Dashboard
- Combos and Playground secondary labels use the muted text token instead of the lighter
  subtle token, which measured 3.09:1 on the light canvas.
- The quota bulk actions use semantic danger/success tokens, replacing red-500 (3.46:1) and
  emerald-500 (2.25:1) on the light canvas.
- The quota connection secondary label drops the 80% opacity that measured 3.69:1.
- Console-log time and source columns use the rail-muted token, which is readable on the
  intentionally dark log surface in both themes.

### v3.3.16 (revoked as a version) (2026-11-03) — Theme-correct contrast on the remaining surfaces

#### Dashboard
- Quota status uses the semantic `success`/`warning`/`danger` tokens (both themes) instead of
  fixed Tailwind greens/yellows/reds; the 10 px percentage text and meter fills now meet
  contrast on the light and dark canvases.
- Inactive quota rows are tinted instead of dimmed at 60% opacity, so their text keeps its
  contrast while the row still reads as inactive.
- The Shutdown utility uses a rail-safe danger token (`--color-rail-danger`); the light-theme
  rose-700 was 2.95:1 on the dark rail.
- The "Auto-detect all applications" action uses `--color-on-primary` instead of hard-coded
  white, fixing 1.74:1 white-on-glacier in dark mode.
- Usage topology fallback initials use the theme text token instead of `#6b7280` (3.78:1 on the
  dark node).
- The setup-wizard command block is keyboard-focusable and labelled.

### v3.3.15 (revoked as a version) (2026-11-03) — Full-surface accessibility and grammar pass

#### Dashboard
- Quota status is text and colour only: the 🟢🟡🔴 glyphs in the progress bar, table and
  helper are removed.
- Every switch exposes an accessible name. `Toggle` accepts `ariaLabel` and falls back to the
  visible `label` or the icon-row `title`, so no `role="switch"` renders unnamed.
- `Input` associates its visible label with the control through `htmlFor`/`id` (`useId`),
  fixing the four unlabelled observability number fields.
- `.command-utility` and the gateway version label use readable rail/text tokens instead of
  the low-contrast muted tokens.
- The usage breakdown scroll container and the CLI command blocks are keyboard-focusable
  (`tabIndex=0`, labelled region).
- `jina-reader-free` maps to the packaged `jina-reader.png`, removing the Media 404.
- Usage zero-cost empty states say no cost was measured ("No measured cost in this period").

#### Tests
- Tests added for switch/Input accessible names (`toggle-input-a11y-render.test.js`), the
  quota no-emoji rule (`quota-no-status-emoji.test.js`) and the Jina icon alias
  (`provider-icon-custom-id.test.js`).

### v3.3.14 (revoked as a version) (2026-11-03) — Test lint cleanup

#### Tests
- Rename the render-test module shim from `module` to `mod` so the Next ESLint rule
  `@next/next/no-assign-module-variable` passes. No application code change from 3.3.13.

### v3.3.13 (revoked as a version) (2026-11-03) — Fix the key selector render crash from 3.3.12

#### CLI Tools
- 3.3.12 removed the `useEffect` import from `ApiKeySelect.js` while the component still
  subscribes to saved key presets in an effect. Any surface that rendered the selector threw
  `ReferenceError: useEffect is not defined`. The import is restored.
- `tests/unit/apikey-select-render.test.js` mounts the component through the real React
  renderer and fails if the import is removed.
- The no-auto-reveal behavior from 3.3.12 is unchanged: placeholder start, explicit selection
  only, no fallback reveal on preset delete.

### v3.3.12 (revoked as a version) (2026-11-03) — API keys reveal only on explicit selection

#### CLI Tools
- `ApiKeySelect` no longer resolves and passes a raw key on mount. The control starts with
  `Select a key…`, and a secret is fetched only when the user picks a key from the list.
- Deleting a saved key preset no longer auto-reveals a different key; the selection is cleared
  and the user picks again.
- The selector still resolves exactly one key id through the guarded single-record endpoint;
  list payloads keep carrying `maskedKey` only.
- Contract test `tests/unit/apikey-select-confirm-reveal.test.js` pins the no-auto-reveal
  rule, the single call site, and the placeholder state.
- Security-flow fix; no API or data change.

### v3.3.11 (revoked as a version) (2026-11-03) — Wizard content fits narrow screens

#### CLI Tools
- Scan results and the `Scanned:` targets no longer force a ~506 px minimum width on phones.
  Long paths wrap (`break-all`), the two status lines break words, and the three wizard steps
  are allowed to shrink (`min-w-0`).
- Fixes the horizontal shift that appeared after using the `Open <tool> setup` anchor on a
  360–414 px viewport: the anchor scrolled a too-wide wizard column and pushed the page header
  off the left edge.

### v3.3.10 (revoked as a version) (2026-11-03) — Failed scans and failed stats reads

#### CLI Tools
- A scan that returns a non-OK response or throws now shows `Scan failed (HTTP n)` /
  `Scan failed: <reason>` and keeps the results list hidden. It never renders
  "Scan Results (0 detected)" for a request that failed.

#### Token Saver
- A failed PXPIPE fallback statistics read is now an error (`stats unavailable`), not
  "Awaiting measured traffic". Only a reachable service with zero traffic says awaiting.

#### Test baseline
- `tests/__baseline__/known-failed-suites.txt` plus the regression comparator now account
  for suite-level collection failures, so a new suite failure fails the check.

### v3.3.9 (revoked as a version) (2026-11-03) — No stats call while Headroom is known down

#### Token Saver
- The savings effect is gated on the status probe. While Headroom is unreachable the page no
  longer calls the stats route, so the down state shows the error row without a guaranteed 500
  in the browser console. When the service comes back the numbers load without a page reload.
- A running service with zero traffic still reads "Awaiting measured traffic" from 3.3.8.

### v3.3.8 (revoked as a version) (2026-11-03) — A quiet service is not a broken one

#### Token Saver
- When Headroom answers but has no measured traffic yet, the Output compression row now says
  **Awaiting measured traffic** instead of the red **stats unavailable**. Only a failed request
  is an error; a healthy service with zero requests is not.
- Restarting the sidecar clears its in-memory counters, so the row was mislabelled until real
  traffic arrived.

### v3.3.7 (revoked as a version) (2026-11-03) — No 404s for custom-provider logos

#### Usage / Providers
- Custom connections use generated UUID ids and never ship a logo file. The icon resolver
  now returns no image for those ids and renders the existing text fallback, so the usage
  page no longer issues guaranteed-404 requests.
- Known providers keep their packaged logos; the one-time missing-icon cache is unchanged.

### v3.3.6 (revoked as a version) (2026-11-03) — Auto-detect, honest stage toggles, Headroom scope

#### CLI Tools
- Step 1 is now **Auto-detect**: one button scans Cursor, Codex, Cline, Roo, OpenCode,
  OpenClaw, Hermes and VS Code with read-only path and `which` probes, and lists each result
  as Detected, Not found, or Check failed. Clicking a result selects the client and moves to
  the status step; the manual search/select path stays.
- Per-client `Scanned:` targets now include Cursor, Roo and VS Code.
- Detection is read-only, user-scope only, and a thrown probe is never reported as "not found".

#### Token Saver
- Stage toggles no longer show an enabled state the server did not persist: the settings
  write is checked, a failure reverts the control, and the page shows `Settings not saved: …`.
- Applies to Caveman, Ponytail, Headroom, PXPIPE and the Headroom URL / timeout fields.

#### Headroom scope
- Headroom stays host-managed with a published image and a single run command; no Docker
  socket or socket proxy is exposed to the gateway. The dashboard shows real state and
  measured evidence, and managed start/stop stays local-binary only.

### v3.3.5 (revoked as a version) (2026-11-02) — No install prompt while Headroom is running

#### Token Saver
- The managed-install command is hidden once the service is reachable, so a running service
  never receives a static setup prompt in either mode: local managed install or published
  container. Only the live service state and measured evidence remain.

### v3.3.4 (revoked as a version) (2026-11-02) — Dual-stack Headroom and install-state fixes

#### Token Saver
- The Headroom proxy now tries every validated address (IPv6 first, IPv4 next) instead of
  pinning the first answer. On hosts where `localhost` resolves to `::1` and the sidecar is
  published only on `127.0.0.1`, the savings row showed "stats unavailable" and the service
  looked unreachable. Both are fixed, with a dual-stack regression test.
- The install step reads **Complete** as soon as the service is reachable, even when the
  gateway has no local Python or headroom binary (container mode). The "Approval required"
  recovery text no longer appears while a service is running.
- The pinned-address security property is unchanged: the socket still never re-resolves the
  hostname; it only chooses among the addresses that were validated.

### v3.3.3 (revoked as a version) (2026-11-02) — Pinned DNS, per-stage evidence, published Headroom image

#### Security
- The Headroom proxy now validates DNS once and pins that address into the socket lookup.
  A second resolution can no longer redirect the request to a public or metadata address
  (`src/lib/headroom/pinnedRequest.js`).

#### Token Saver
- Savings evidence is per stage: PXPIPE (measured from `/api/pxpipe/status`), Output
  compression (measured Headroom totals), Caveman and Ponytail (enabled state, explicitly
  "not measured per request"). A failed stage shows its own error and never blanks the panel.
- A running Headroom service no longer shows the container setup prompt.

#### CLI Tools
- The setup wizard lists the exact binaries and files each status check reads.
- Every installed-client row has an anchor, and the wizard links straight to its setup card
  with the existing Apply / model search / clear controls.

#### Headroom deployment
- The proxy image is published at `ghcr.io/konaimav2/headroom:0.42.0` by a dedicated CI workflow.
- Setup is one `docker run`; there is no Dockerfile to write by hand. The pinned command keeps
  loopback-only publishing and the container bind acknowledgement.

#### Notes
- The Console Log Headroom panel remains deferred.
- `/api/usage/chart` ignored `startDate`/`endDate` at this point; the route now honors them.

### v3.3.2 (revoked as a version) (2026-11-02) — No invented setup snippet

#### CLI setup wizard
- A client that declares neither copyable `guideSteps` values nor `envVars.baseUrl` (Codex) now
  shows "No copy-paste snippet is declared for this client." instead of a borrowed Claude
  `ANTHROPIC_BASE_URL` export. The wizard only prints what the catalog declares.
- Copy is disabled while the gateway origin is unresolved or no snippet is declared.

### v3.3.1 (revoked as a version) (2026-11-02) — Setup wizard fixes

#### CLI setup wizard
- Snippets now come from the catalog's `guideSteps`. 3.3.0 read a `steps` key that no tool
  defines, so every client rendered Claude's `ANTHROPIC_BASE_URL` fallback instead of its own
  command.
- Detection uses the status payload's `installed` flag: `installed: false` is **absent**, a
  `null` entry (the getter threw) is **check-failed**, and a missing entry is **unavailable**.
  3.3.0 reported **detected** whenever any object came back, so an uninstalled Codex showed as
  detected.
- The gateway origin is resolved with `useSyncExternalStore`, so the server and first client
  render agree. This removes the React #418 hydration text mismatch on the CLI Tools page.

---

## 2026-11-05 — MITM accessibility + shared Badge tokens (unversioned)

- `src/shared/components/Badge.js`: status variants now use the semantic
  `--color-success/warning/danger/info` tokens and their 12% `*-wash` backgrounds
  instead of raw Tailwind palette colors, so badge text follows each theme's
  contrast-checked status colors.
- `src/app/(dashboard)/dashboard/cli-tools/components/MitmToolCard.js`: the
  tool-card header is a real `<button type="button">` with `aria-expanded` and
  `aria-controls` (useId panel id), phrasing spans, an `aria-hidden` chevron,
  and an empty image alt. Keyboard users can expand the MITM tool settings.
- CI: `docker-publish.yml` adds a short `sha` image tag on manual
  (`workflow_dispatch`) runs, so an image can be published without a version tag.
- Known issue: some MITM server-card text is still below AA contrast in the light
  theme (the "Trusted" status in `text-green-600` and "Stop Server" in `text-red-500`).

## 2026-11-07 — Fast combo handoff and upstream reset ledger (unversioned)

- A shared classifier (`open-sse/utils/networkError.js`) unwraps nested Undici
  cause codes for `ECONNRESET`, `EPIPE`, `UND_ERR_SOCKET` and socket-hang-up,
  while excluding client/deadline aborts, DNS failures and timeouts.
- `BaseExecutor` sends at most one request per base URL for a classified socket
  reset, then advances to the next base URL or throws promptly; HTTP 502/503/504
  responses and unrelated network failures keep their configured retry behavior.
- A pre-header reset inside a combo cools the failing connection once and hands
  the 502 to the combo immediately (logged as `COMBO_RESET_HANDOFF`), instead of
  rotating through every account of the same dead member. Standalone (non-combo)
  account rotation is unchanged.
- A reset after the HTTP/SSE response has started never replays another combo
  member; the client-format failure terminal is sent and the reset is recorded.
- Pre-header resets write `6_error.json`, `6_stream_termination.json` and an
  `errors.jsonl` entry (reason `upstream_network_reset`, provider, model, code,
  URL index, duration). Full prompts are not duplicated into error artifacts and
  URLs are credential-masked.
- Tests added for the classifier, executor retry policy and the combo handoff
  through the real chat handler chain.

## 2026-11-07 — Immediate combo handoff on upstream socket reset (unversioned)

- Same change as the entry above (recorded twice during the hotfix series).

## 2026-11-07 — Do not truncate large account rotations at eight attempts (unversioned)

- Removed the fixed `ACCOUNT_ROTATION_MAX_ATTEMPTS` (8) cap from chat account
  rotation, so large pools can reach eligible accounts beyond the eighth.
  `ACCOUNT_ROTATION_DEADLINE_MS` (default 75 seconds, env-overridable) remains the
  overall bound: it aborts the in-flight attempt and returns a retry-safe 504 when
  the budget is spent.
- Per-account HTTP retries, 429 cooldowns and Codex plan eligibility filters are
  unchanged.
- Tests added: a pool with 503s on accounts 1–9 now reaches healthy account 10
  (the old cap returned 503), and the time deadline still stops rotation.
- Known limitation: per-account HTTP retry pacing still adds several seconds for each
  account that answers 503.

## 2026-11-07 — Allow rotation through large eligible pools (unversioned)

- Same change as the entry above (recorded twice during the hotfix series).

## 2026-11-10 — Combo Manage route: single panel, inline member edit, save closes (unversioned)

- `src/app/(dashboard)/dashboard/combos/page.js`: only one Manage route panel is open at a
  time. A displayed member ID is a button that opens its inline editor (edit icon kept).
  Save route applies an open member field and closes the panel only on success; a failed or
  rejected save keeps it open with an inline alert; Cancel discards and closes.
- While a member field is open, Move/Remove/drag/second edit/Add model are locked, and edits
  are refused while the add-model picker is open, preventing a stale edit index from
  corrupting the saved route.
- Phone widths: action icons wrap under the ID, the edit input gets its own line, and icon
  buttons stay 44x44 (`IconButton` is `shrink-0`). No API, persistence or strategy change.
- Tests added in `tests/unit/wave-d-ui.test.js` for the controlled panel, direct edit,
  save-while-editing, success close, failure retention, cancel, mobile classes, stale-index
  cases and the picker lock.
- Known issues: a hidden unsaved draft survives a panel switch, a slow save can close another
  combo's panel, edits made during an in-flight save are dropped, and the footer Save/Cancel
  buttons are 32px tall.
