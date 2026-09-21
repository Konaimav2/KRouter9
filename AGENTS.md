# AGENTS.md — KRouter9 working restrictions & preferences

Derived from the 1.0.1/1.1.0 build session. Normative for all agent work in this repo.
`open-sse/AGENTS.md` still governs anything under `open-sse/` — read it before touching the engine.

## Subagent routing (hard rule)

- Implementation: `spark*` workers only (`spark-backend-1`, `spark-backend-2`, …).
- QA: `flash` / `flash-qa` only. Proof must be behavioral (API assertions), never screenshots alone.
- Security: `sol-security` ONLY for security-sensitive work — suspension LIFTED after
  the P0a combo-loop ship (the "dont use sol" rule was combo-loop-caused). `sol`
  runs the pre-ship security check for 1.0.1/1.1.0. If loop symptoms ever return
  on papi, re-suspend `sol` immediately and treat it as a P0.
- Never use `terra-debug`.
- Subagents must NOT commit, restart, publish, or touch papi infrastructure. They return files-changed + test/lint results; the orchestrator verifies and commits.

## Operating discipline (no weird stops)

Stalls after tool-use/thinking are a process bug, fixed by process:

- **TodoWrite is mandatory** for anything with 3+ steps. Exactly one `in_progress`;
  mark `completed` immediately after the work is done and verified — never batch.
- **Never end a turn with work remaining and unreported.** If context or limits loom,
  write the handover first (Objective / Important Details / Work State /
  Completed-Active-Blocked / Next Move / Relevant Files), then stop — a stop with a
  handover is a checkpoint, not a stall.
- **Batch independent tool calls** in one block; chain dependent ones with `&&`.
  Prefer dedicated tools over bash for files (`read`/`edit`/`write`, `grep`/`glob`).
- **Subagent waves always close the loop**: every dispatched wave ends with the
  orchestrator recording files-changed + test/lint results, or an explicit blocked
  reason. A wave with no recorded outcome is a defect — re-drive it next turn.
- **Always summarize when a turn ends.** Every turn closes with a written summary —
  even if nothing shipped: what was done, what was verified (with evidence), what
  is open/blocked, and the exact next move. A turn with no closing summary is a
  defect, same as a wave with no recorded outcome.
- **Resume protocol**: on wake/compact/continue, re-read `AGENTS.md` + `TARGET.md`,
  check `git status`/`git log --oneline -5`, re-list todos, then proceed. Do not
  re-do completed work; do not re-litigate decided behaviors.

## Planning protocol (how to plan: x, y, z, a, b, all)

- **Shape before code.** For any multi-step goal write the plan as: goal → waves →
  per wave: scope, files, tests, QA/evidence, done-criteria. Keep the plan in
  `TARGET.md` (ship goals) or the turn's todo list (session goals), not in chat prose.
- **Waves are parallelizable units.** One wave = one subagent-sized chunk with no
  shared mutable state with other waves. Name waves (A6, A2+A3, …) and track each in
  TodoWrite.
- **Dispatch, don't serial-walk.** Independent waves go out together via `Task`
  (`spark*` for impl, `flash`/`flash-qa` for QA). The orchestrator integrates,
  verifies (`build` + targeted vitest + baseline), and commits.
- **Depth over surface (rule).** For unfamiliar code: read the implementation and its
  tests before touching; reproduce the bug (failing test or live probe) before
  fixing; verify behaviorally after. "Looks right" is not evidence.
- **Plans end in evidence.** Each wave's done-criteria names the artifact: test file
  + result, `curl` assertion, agent-browser assertion + screenshot path.

## Live-gateway restrictions (papi)

- Production gateway (`krouter9` container) serves live agent traffic. **No restarts while `spark*` agents route through it.** Batch all restart-gated steps.
- Never touch/stop the `cloudflared-9router` container.
- Papi image swaps are approval-gated. `npm publish` rebuilds Next (~10 min); cold docker build >25 min — resume from cache.

## Build & verify

- Gateway (repo root): `npm install`; dev `PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev`; prod `npm run build && PORT=20128 HOSTNAME=0.0.0.0 npm run start`. Bun variants `dev:bun`/`build:bun`/`start:bun`. Default port **20128** (`/dashboard`, `/v1`). Known wart: `npm run start` hardcodes `--port 20127` (fix tracked in TARGET.md) — pass the port explicitly until fixed.
- Lint touched files: `timeout 55 npx eslint <files>` plus `npx -y oxlint@1.83.0` (config `.oxlintrc.json`; oxlint catches unused imports, not `no-undef`).
- Tests (`tests/`, independent ESM package): `timeout ... npx vitest run --root tests unit/`; single file `npx vitest run unit/<name>.test.js`. The suite is NOT all-green on checkout (~64 pre-existing fails) — judge regressions with `tests/__baseline__/verify-no-regression.mjs`, not raw runs. `*.real.test.js` need credentials; `unit/embeddings.cloud.test.js` always fails here (`cloud/` not in repo).
- Commits: Conventional Commits (`fix(translator): …`); root and `cli/` versioned independently; log changes in `CHANGELOG.md`.

## Pre-ship gate (must pass before any version publish)

1. `npm run build` green on the ship tree (subagents inherit a compiling base).
2. Targeted unit tests for every touched area + `tests/__baseline__/verify-no-regression.mjs` shows no new failures vs `known-fails.txt`.
3. Real tests: run every `tests/**/​*.real.test.js` that can run here. They need upstream credentials — if creds are absent the run is recorded as **blocked (no creds)**, never faked green. No `*.real.test.js` may be skipped silently; list each as pass / fail / blocked.
4. agent-browser dashboard QA against a local dev gateway (`PORT=20128 … npm run dev`, never papi): load `/dashboard`, walk every touched page, assert behaviorally (picker options load, toggles persist after reload, reveal copies + auto-hides, masked values contain no secret). Screenshots supplement assertions, never replace them. Evidence dir per release (e.g. `/tmp/opencode/kr9_qa/`).
5. Papi swap only after 1–4 are recorded, with explicit user approval.

## Data & code conventions

- State is SQLite under `src/lib/db/` (adapter chain `bun:sqlite` → `better-sqlite3` → `node:sqlite` → `sql.js`). New code imports `@/lib/db/index.js`; `src/lib/localDb.js` is a compat shim. Schema changes follow the `SCHEMA_VERSION` bump + migration convention in `src/lib/db/`.
- Plain JS (ESM), `@/*` → `src/*`. Never hardcode provider/model/role strings — use `open-sse/config/` + `translator/schema/`.
- Translators self-register via `register(from, to, …)` and MUST be imported in `open-sse/translator/index.js`. `providers/registry/index.js` is auto-generated — regenerate, don't hand-edit.
- `rtk/` hooks are fail-open: never throw; return null and leave the body untouched.
- `custom-server.js` owns client-IP derivation (unspoofable socket address). Preserve it when touching request/IP/rate-limit code.

## Decided behaviors (do not re-litigate)

- Per-key `userAgent`: DELETED. Its 12 presets merged into provider-level `NODE_UA_PRESET_OPTIONS`; startup migration clears orphaned `psd.userAgent`.
- Sticky fallback TTL default **5 min**, applies to fallback + round-robin.
- Proxy URLs: censored/masked everywhere (list, cards, edit modals) with blur + confirm-to-reveal; single-record `GET /api/providers/[id]/reveal` only (`?confirm=true`, dashboard-auth, audit-logged, rate-limited, `no-store`, never bulk).
- Upstream key dedupe: per-provider scope, constant-time SHA-256 compare, trim-normalized, `409 "already exists as <name>"`.
- Combo safety: visited-chain 503 + self-member pre-filter (bare and slash-qualified tail match); attempt logs throttled to 3 + 1 mute notice.
- Error taxonomy: distinct `refresh-invalid` status; normalized classes auth-invalid/refresh-invalid/ratelimited/network/unknown; sort/group on providers + quota pages.
- New providers from papi live specs: AgentRouter `https://agentrouter.org/v1` (`agentr`), B.AI `https://api.b.ai/v1` (`bai`), TokenHarbor `https://tokenharbor.ai/v1` (`tkhb`).
