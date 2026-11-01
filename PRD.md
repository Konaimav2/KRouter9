# PRD — KRouter9 3.3.0: UI/UX audit + redesign

Status: **scope fixed (§11b, option B); reconciled against the shipped product on 2026-10-27.** Navigation contract, landed work and remaining scope verified against `Sidebar.js` and `DESIGN.md:39`; the document awaits pipeline review.
Owner: operator (Konaimav2).
Author: agent session 2026-10-25 (authored with gpt-6.1-sol).
Predecessor: 3.2.2 (routing correctness) — shipped and live on papi 2026-10-24.

## 0.1 Landed in the unreleased tree (verify, do not rebuild)

These are implemented and verified in the working tree but are **not shipped**: security S1–S6,
Next.js 16.4.3, FR-3 strict free-lane pool binding, FR-6 usage zero-gates, FR-7 combo inline
rename, FR-8/8b OpenCode retirement + live status checker, the codex 24-hour entitlement lock,
and rotation-aware (time-boxed) retirement for the rotating free catalog. They must be
re-verified after the tree is reconciled with `origin/main`, not rebuilt.

## 0.2 Correction

**The repo-root `DESIGN.md` is obsolete and must not be implemented as written.** It is being rewritten in place for 3.3.0 as the canonical **Switchboard Ledger** brief. Nothing re-skins to its old palette.

| Evidence | Verified finding |
|---|---|
| Obsolete brief | `DESIGN.md` was last modified in commit `3c52921b6`, the **1.1.0 release**. It described an “operations console” with teal-cyan brand colors (`#0D9488` / `#2DD4BF`) and Operate / Observe / System navigation. |
| Shipped replacement | **v3.0.0 (2026-10-03)** delivered “Switchboard Ledger”: carbon/mineral + lichen tokens, self-hosted Atkinson Hyperlegible Next + Commit Mono, signal rows, ledger bands, and Lucide icons. The sidebar zone labels shipped as **Operate / Observe / System** from v3.2.1 (live on papi); the 3.0.0-era labels are not the current contract (`Sidebar.js`). |
| Shipped surfaces | The 3.0.0 CHANGELOG lists Login, Settings, CLI Tools, Skills, Media, Proxy Pools, Token Saver, Console Log, Quota, and Usage as overhauled. |
| Live implementation | `globals.css` is headed “Switchboard Ledger: primitives -> semantic aliases -> component tokens” and carries `--p-carbon-*` / `--p-glacier-*` primitives. The “9Router palette — orange/coral” header cited by the obsolete brief no longer exists. |

The original G1 “brand swap” and Q1 framing of “the rest of `DESIGN.md`” were based on an obsolete description of the product. The whole-app visual replacement already shipped in 3.0.0; applying the old teal-cyan brief would reverse that release, not complete it.

The operator’s decisions are fixed. The corrected scope answer (§11b, **B**) resolves the obsolete framing without reopening Q1–Q5. What survives is:

1. **The eight named items (§5)**, completed against the current implementation.
2. **A genuine UI/UX audit** of every shipped Switchboard Ledger surface, with `file:line` evidence rather than impressions.
3. **A refreshed brief that supersedes the obsolete `DESIGN.md` content**, documenting the shipped grammar and per-surface requirements for the eight items.
4. **A full-surface polish pass** against that brief: density, empty/loading/error/success/offline states, responsiveness, and accessibility, fixing audit findings beyond the eight items.

`DESIGN.md` remains the single canonical design document and is rewritten in place. 3.3.0 is the UI/UX audit + redesign, not another routing-correctness release or a return to the 1.1.0 identity.

## 0.3 Status of the eight items against 3.0.0

Two of the eight partly exist because 3.0.0 shipped guidance, not the required functional setup:

| Item | Shipped state | 3.3.0 obligation |
|---|---|---|
| CLI Tools — One-Click Setup | “CLI guided setup” shipped as guidance. The audit found copyable install/verify instructions, not detection and a generated-command wizard. | Make setup functional through the wizard, honest detection, per-tool setup, exact config paths, and generated copy-paste command over the existing cards. |
| Headroom on papi + Auto Configure | “Headroom one-click setup status” shipped as **guidance only**; routes exist, but the service is not deployed on papi. | Deploy the second container behind its own approval and resource-budget gate; provide functional auto-configuration, controls, and real service status. |

Of the originally requested outcomes, **four are implemented in the unreleased tree** — free-lane
proxy-pool use (FR-3, strict binding + refusal), removal of all-zero Trend tables (FR-6),
combo-member inline model-ID rename (FR-7), and retirement of dead OpenCode free-model IDs
(FR-8/8b, now rotation-aware and time-boxed). **Still open:** Token Saver redesign (FR-4) and
Console Log redesign (FR-5), plus the CLI One-Click Setup wizard (FR-1), Headroom (FR-9), the
full-surface polish (FR-10/11), E2E, refactor and the release cut.

“Unshipped” does not mean every underlying control is absent. The audit confirms an existing no-auth proxy binding control, but it reports success without checking the save response; whether it reaches the OpenCode free lane specifically remains unverified. Each item’s current state must be confirmed before its design specification locks.

## 1. Problem

KRouter9’s dashboard is the product’s only control surface. It originated as a port of the upstream 9Router shell rather than a design for this deployment. The obsolete brief recorded the inherited orange/coral header and item-for-item upstream sidebar order; those are historical evidence, **not a description of the current Switchboard Ledger UI**.

Two consequences have been observed on the live deployment:

1. **Inherited product identity and structure were not designed for KRouter9’s operation.** The original wrong-brand symptom was addressed by 3.0.0’s Switchboard Ledger replacement. The remaining task is to audit and polish that shipped design for this deployment, not repeat the brand swap or restore the obsolete palette.
2. **Specific surfaces are broken or dishonest about state.** The eight named items include useless all-zero Trend tables, misleading empty provider cells or pickers that silently ignore clicks, missing Headroom deployment, and proxy pools configured without confirmed free-lane use. Source-derived audit findings also identify unchecked mutations and failed reads presented as empty configuration; rendered behavior and contrast ratios remain unverified pending the browser and vision passes.

The highest-cost symptom remains operational: the operator runs live coding-agent traffic through this gateway but cannot reliably determine from the dashboard which of **296 provider connections** is healthy, which CLI tool is wired up, or where a request actually went. The UI must make those answers verifiable without opening the database or reading container logs.

## 2. Users and personas

### Persona A — "the operator"

**Primary; the only current user.** Runs KRouter9 on a VPS behind Cloudflare, with **296 provider connections across ~20 providers**, routing real coding-agent traffic through `/v1`.

Works in the dark theme at a desk. Wants density and truth: status at a glance, no decorative chrome, tabular and aligned numbers, and verifiable claims. Their definition of good UI is **"I can see what is happening and change it without guessing."** Success is measured in **seconds-to-answer**.

The dashboard must let this operator determine what is connected, what is healthy, and where a request went without opening the database or reading container logs.

### Persona B — "the new self-hoster"

**Secondary; not yet a real user.** Has cloned the repository and started KRouter9. Wants to connect the CLI tool they already use—**Claude Code / Codex CLI / OpenCode / Cline**—without first learning what a "provider connection" is.

If they cannot get a working tool in **about two minutes**, they leave. They judge the UI before they judge the router.

This persona justifies design weight on **CLI Tools and first-run surfaces disproportionate to their code size**: exact config paths, endpoint and key copy blocks, honest detection, and a generated setup command must make the first working request understandable. The separate first-run onboarding wizard remains unscheduled.

## 3. Goals and non-goals

### Goals

| ID | Goal | Measurable success signal |
|---|---|---|
| G1 | Keep the dashboard recognizably KRouter9 through the shipped Switchboard Ledger grammar, documented in the rewritten canonical `DESIGN.md`; do not repeat the delivered brand swap or restore the obsolete teal-cyan palette. | Every dashboard surface is audited with `file:line` evidence and checked against the refreshed brief during the full-surface polish pass. Token-file inspection and rendered checks confirm no inherited orange/coral brand tokens or obsolete teal-cyan re-skin; the obsolete orange/coral header does not return. |
| G2 | Every in-scope surface tells the truth about state: no misleading all-zero tables, blank cells, unchecked success claims, or controls that silently do nothing. | Each MVP item has a behavioral assertion against a live development gateway with production-shaped data. Failed reads remain distinguishable from empty data; failed writes do not report success. A known-all-zero period renders an explanatory empty state, not a zero table; partial periods retain meaningful data. |
| G3 | Let the operator answer "what is connected, what is healthy, where did it go" without the database or container logs. | The dashboard walk verifies connection, service-health, and request-destination evidence against actual outcomes. Seconds-to-answer is the evaluation measure; no numeric target is specified. |
| G4 | Let a new self-hoster wire a CLI tool to the gateway from the UI, using a copy-pasteable command or exact config snippet without reading documentation. | At least one tool is configured end-to-end from the UI and successfully requests the local gateway through that configuration. Evaluate the flow against Persona B's expectation of about two minutes. |
| G5 | Maintain the accessibility floor in both themes across every touched surface. | Independently verify contrast in dark and light themes, visible focus, keyboard operation, and the 44px target floor; new transitions respect `prefers-reduced-motion`. |

### Non-goals and boundaries

| ID | Exclusion | Boundary |
|---|---|---|
| N1 | Routing semantics, fallback policy, cache, and translators | Backend work remains tracked in `TARGET.md`. 3.2.2 routing correctness is shipped and live; the explicitly required free-lane pool integration remains in 3.3.0 scope. |
| N2 | New upstream providers or models | No additions beyond retiring dead free-lane IDs from selection; historical usage still renders. |
| N3 | Auth/session redesign, SSO, multi-user, and roles | No expansion of authentication or user-management scope. |
| N4 | Mobile-native application | Keep the existing responsive web layout and check touched surfaces responsively. |
| N5 | A new palette or return to the obsolete brief | Rewrite `DESIGN.md` in place for Switchboard Ledger; do not implement the 1.1.0 teal-cyan "operations console" palette. |
| N6 | Committing `labs/` artifacts or agent-memory files | Neither belongs in release commits. |

The separate first-run onboarding wizard, virtualized lists of **50+ rows**, and fork-derived `docs/FEATURES.md` items remain unscheduled. The papi cleanup of dead `ohh` / `grip` / `gpt-6-sol` combo members is a separate live-data mutation awaiting its own approval. Pre-existing unrelated changes in `PROJECTS/STATUS.md` remain uncommitted.

## 4. User stories (MVP)

| ID | Persona | Story | Acceptance signal |
|---|---|---|---|
| US-1 | Operator | I want to see what is routed where and whether a provider connection can serve the selected model, so I can distinguish configured entries from working request paths. | A request through the live development gateway provides dashboard evidence of its actual destination and success or failure. Failed checks are not presented as healthy, empty, or successful configuration. |
| US-2 | Operator; new self-hoster | I want my CLI tool detected and connected to this gateway in one setup flow, with endpoint and key copy blocks beside its card, so I can paste and go instead of hand-editing `~/.codex/config.toml` or reading docs. | The wizard over existing cards provides honest detected/not-detected states, exact config paths, per-tool setup, and a generated copy-paste command or exact snippet. Endpoint and key material are masked with copy and confirm-to-reveal controls. At least one configured tool successfully requests the local gateway. |
| US-3 | Operator | I want free-lane traffic bound to my configured proxy pool, so a rate-limited or dirty exit IP stops burning the free tier without exposing the server's own IP. | The saved binding is visible on `/dashboard/proxy-pools`, and free-lane requests actually egress through it. If all members are down, requests fail loudly, naming the pool and tried members; there is no direct fallback or silent bypass. |
| US-4 | Operator | I want to understand spend and which Token Saver compression stages save what, so I can tell whether compression is earning its keep without mistaking missing data for zero usage. | Token Saver shows enabled state and measured savings per stage. Cost presentation distinguishes token-apportioned estimates from measured charges. Trend/breakdown visibility follows the selected metric and period: all-zero tables disappear with an explanatory empty state, while partial data remains visible. |
| US-5 | Operator | I want to investigate a failure from the newest Console Log entry and control Headroom there, so debugging starts with current evidence rather than scrolling or guessing. | Console Log opens pinned to the newest entry and exposes Headroom controls. Read and mutation failures remain visible rather than appearing as empty data or successful actions; a failed clear is not reported as successful. |
| US-6 | Operator | I want to rename a combo member's model ID in place, so a typo does not require removing and re-adding the entry. | The edited `"<alias>/<model>"` string persists in the same ordered position. `combos.models` remains a JSON array of strings; no display-label migration or schema change is introduced. |
| US-7 | Operator | I want the OpenCode free lane to list only models still served upstream, so I stop selecting dead IDs. | Retired IDs disappear from selection. Historical usage rows still render, and retired references already stored in combos or key policies degrade to "model unavailable" without breaking rendering or routing. |
| US-8 | Operator | I want Headroom deployed on papi with Auto Configure, so I do not hand-edit server files and can tell whether it is actually running. | After its separate production approval and memory/CPU budget check, Headroom runs as a second container without disturbing the gateway or `cloudflared-9router`. UI start/stop/restart and health reflect real service state; failed status checks are not labeled "not installed," and a running service does not show a static setup prompt. |
| US-9 | Operator | I want failed reads and saves to be distinguishable from empty configuration and completed changes, so I can change the system without guessing whether the change took effect. | Failure-path assertions cover combo settings, provider toggles and connection loads, endpoint-key loading, quota loads, Token Saver toggles, CLI model saves, proxy binding, and log clear. Failed key reads do not create a default key; failed saves do not leave an unqualified success state. |

## 5. The eight named items

These eight items remain the source of truth for named feature scope. The audit confirms partial implementations, not completion; verify current behavior before locking each surface specification.

1. **CLI Tools — One-Click Setup.** Reference: the bykitsune “One-Click Setup” wizard, captured in `labs/p6-usage-breakdown/03..05` and read by OCR this session. Preserve its reference structure:
   - Search and a **3-step wizard: auto-detect → install mode → done**.
   - An “auto-detect all applications” scan explicitly targeting **Cursor, Codex, Cline, Roo, OpenCode, OpenClaw, Hermes, VS Code**.
   - Per-tool cards with a title, a one-line “what this connects,” the config path written (`~/.claude/settings.json`, `~/.codex/config.toml`, …), and a primary **Setup** action.
   - An installed-models grid with **search + clear**, and a generated setup command.
   
   Existing cards are `ClaudeToolCard`, `CodexToolCard`, `OpenCodeToolCard`, `ClineToolCard`, `CopilotToolCard`, `HermesToolCard`, `OpenClawToolCard`, `DroidToolCard`, `KiloToolCard`, `JcodeToolCard`, `CoworkToolCard`, `GrokBuildToolCard`, `AntigravityToolCard`, `DeepSeekTuiToolCard`, `KRouter9ToolCard`, `MitmToolCard`, and `DefaultToolCard`. This item adds the **wizard + detection + generated-command layer over those cards**, not a rewrite of each card or a bykitsune provider/card. 3.0.0 shipped CLI guided setup; the audit finds copyable install/verify guidance, not detection or a generated setup command. Catalog size must not be labeled as detected installations. A vision-capable pass over the reference screenshots must precede locking the layout: OCR did not capture exact spacing or typography.

2. **Proxy pools on the OpenCode free lane.** The `proxyPools` table and `/dashboard/proxy-pools` page exist. The source PRD identifies the free, no-auth lane as not using them; the audit confirms a no-auth binding control but has not verified that it reaches the OpenCode free lane specifically. Make that integration functional and its saved state truthful. **Strictly the pool, never direct:** when every bound member is down, fail loudly with the pool and tried members named; never expose the server’s own IP through direct fallback or silent bypass.

3. **Token Saver redesign.** Redesign the existing **33 KB client component**, whose sections are “Token saver stages,” “Compression pipeline,” “Current savings evidence,” and “Headroom setup rail.” Preserve coverage of **PXPIPE / Output compression / Caveman / Ponytail**. Show persisted enabled state and measured savings per stage; reflect real Headroom status rather than converting failed checks into “not installed.”

4. **Console Log redesign.** Include `HeadroomSetupButton.js` and the HEADROOM controls already surfaced in Console Log. Open at the newest line, expose Headroom control, check clear-operation results, and address the uncapped paused buffer identified by the audit.

5. **Drop the all-zero Trend tables.** An all-zero table falsely asserts “no usage” when the truth may be “not loaded” or “not applicable.” Gate Trend on the **selected metric**, not `tokens > 0 || cost > 0`, and gate Breakdown on displayed data rather than merely the existence of `config`. Preserve partial periods containing meaningful data.

6. **Combo inline rename.** Rename a **member entry’s model ID in place**, not the combo name. Manage Route currently offers move/remove; the separate “Rename combo” textbox does not satisfy this item. Persist the edited `"<alias>/<model>"` string without changing order. `combos.models` remains a JSON array of strings: **no schema change and no display-label migration**.

7. **Retire retired OpenCode free models.** The registry lists `muse-spark-1.2` / `muse-spark-1.3` (Go lane: `muse-spark-1.2-contributor` / `muse-spark-1.3-contributor`), `mimo-v2.5-free`, `nemotron-3-ultra-free`, `nemotron-3.5-lightning-free`, `deepseek-v4-flash-free`, `ling-3.0-flash-fin-free`, `jev-1.13-free`, … . Live traffic and usage also reference `nemotron-3-super-free` and `deepseek-v4.1-flash-free`, which are absent from the registry: configured/stored IDs that upstream no longer serves. The Muse Spark family is rotation-retried, not permanently disabled (§0.1). Verify upstream availability and remove retired IDs from selection; historical usage must still render through the existing 3.2.2 P6 unknown-ID label helper.

8. **Headroom on papi + Auto Configure.** Existing routes are `/api/headroom/start`, `/api/headroom/stop`, `/api/headroom/restart`, `/api/headroom/status`, `/api/headroom/proxy/[...path]`, and `/api/headroom/extras`; the service is not deployed on papi. 3.0.0 shipped one-click setup status as **guidance only**. Make **Auto Configure** functional without hand-editing server files, and deploy Headroom as a **second container**. This new production process requires its own approval gate and memory/CPU budget check and must not disturb the gateway or `cloudflared-9router`.

## 6. Scope split

The operator’s corrected scope decision is fixed: **audit + the eight items + refreshed brief + full-surface polish**. 3.2.2 routing correctness is shipped and live; 3.3.0 is the UI/UX audit and redesign.

| Bucket | Scope |
|---|---|
| **MVP — 3.3.0** | Ship items 1–8; audit every shipped Switchboard Ledger surface with `file:line` evidence; fix audit findings through a full-surface polish pass covering density, empty/loading/error/success/offline states, responsive behavior, and accessibility. |
| **MVP — canonical brief** | Rewrite repo-root `DESIGN.md` **in place** for the shipped Switchboard Ledger grammar and per-surface specifications. Keep one canonical design document. The obsolete 1.1.0 teal-cyan “operations console” brief is retired; nothing re-skins to it. |
| **MVP — full-surface coverage** | Cover Providers, Combos, Endpoint, Playground, Usage, Quota, Token Saver, Console Log, Translator, CLI Tools, Proxy Pools, Media, Skills, Settings, and shell/navigation. Include provider forms, key policy, quota states, error-taxonomy display, key reveal, account toggles, forms, media-provider organization, and topbar consolidation in the audit and refreshed contracts. |
| **v2** | No retained v2 bucket: Q1 promoted the previously deferred full-design surface coverage into MVP; the corrected scope applies that coverage to the shipped Switchboard Ledger grammar, not to a re-skin of the obsolete 1.1.0 teal-cyan “operations console” brief. |
| **Later** | No later release is assigned to deferred work. Separate production or live-data approvals remain separate; inclusion here does not grant approval. |

The audit’s Operate/Observe/System grouping describes its read-only work allocation, not a navigation decision. Preserve the shipped **Operate / Observe / System** grammar (`DESIGN.md:39`, implemented in
`Sidebar.js`) rather than repeating the 3.0.0 visual replacement. At release, bump the product to **3.3.0**; `cli/` stays **1.0.0**.

### Not scheduled

- Separate first-run onboarding wizard for Persona B.
- Virtualized lists of **50+ rows**.
- Fork-derived `docs/FEATURES.md` items.
- Papi cleanup of dead `ohh` / `grip` / `gpt-6-sol` combo members: separate live-data mutation awaiting its own approval.
- Committing `labs/` artifacts, agent-memory files, or pre-existing unrelated changes in `PROJECTS/STATUS.md`.

Audit findings are source-derived; rendered behavior and contrast ratios remain unverified until the orchestrator’s browser pass (**gate 5**) and vision pass. Complete the outstanding shell/accessibility/navigation coverage, tool-card inventory, free-model picker inventory, and free-lane binding verification. Route the endpoint raw-key `title` exposure to the **security gate**, not merely the polish pass.

## 7. MVP functional requirements

Each requirement requires a behavioral assertion against a live development gateway with production-shaped data; screenshots supplement, never replace, behavioral evidence.

1. **FR-1 — CLI setup wizard.** Over the existing cards, provide the item 1 search, three-step wizard, explicit scan targets, per-tool setup action, exact config path, installed-models search/clear, and generated copy-paste command or exact config snippet. Distinguish detected, not detected, and failed detection; do not count the catalog as installations. Report absent, read-only, or malformed config appropriately, never write a half-config, and do not clobber tools sharing a file. Verify at least one configured tool successfully requests the local gateway. **Trace: US-2.**

2. **FR-2 — Endpoint and secret handling.** Every CLI tool card must show the required endpoint and key block with masked key material, copy controls, and confirm-to-reveal consistent with the refreshed proxy-URL/key contract. Verify the reveal contract, including “never in component state, never bulk”; a revealed key must not also enter a row’s `title` attribute. Security-gate verification must cover the endpoint exposure identified at `dashboard/endpoint/EndpointPageClient.js:916`. **Trace: US-2, US-9.**

3. **FR-3 — Strict free-lane proxy binding.** Persist a pool binding, display it on `/dashboard/proxy-pools`, and prove OpenCode free-lane traffic actually egresses through that pool. A failed binding PATCH must not report “Saved.” With all bound members down, fail loudly, naming the pool and tried members in the existing “tried: a → b” style; never fall back to direct egress or silently bypass the pool. **Trace: US-3, US-9.**

4. **FR-4 — Token Saver evidence.** Show persisted enabled state and measured savings for PXPIPE, Output compression, Caveman, and Ponytail. Check setting-write responses; failures must not leave an unqualified enabled/success state. Headroom status failures must remain errors, not “not installed”; one failed stage or unavailable Headroom must not produce a whole-page error. **Trace: US-4, US-8, US-9.**

5. **FR-5 — Console Log behavior.** Open pinned to the newest entry and expose Headroom control. Bound the paused buffer as well as live logs to prevent uncapped growth; verify pause/resume behavior. Check the clear DELETE result and visibly distinguish failure from a completed clear. **Trace: US-5, US-9.**

6. **FR-6 — Usage visibility and cost truth.** Hide Trend/breakdown tables whose displayed values are all zero for the selected metric and period; show an explanatory empty state instead of zero rows. Distinguish loading, failure, not-applicable, and genuine “no usage in this period.” Keep partial periods with meaningful data visible. Label token-count-apportioned input/cached/output costs as estimates, not measured provider charges. **Trace: US-4, US-9.**

7. **FR-7 — In-place member rename.** Edit and persist a combo member’s model ID at its existing ordered position, retaining the `"<alias>/<model>"` string-array representation. Verify reload persistence, unchanged ordering, and visible failure when saving fails; do not substitute combo-name editing or introduce display labels. **Trace: US-6, US-9.**

8. **FR-8 — Current free-model selection.** Verify upstream availability across free-lane pickers and remove retired IDs from selection without deleting historical usage. Existing retired references in combos or key policies must render and degrade to “model unavailable” without breaking rendering or routing; verify unknown-ID historical labels still resolve. **Trace: US-7.**

9. **FR-9 — Functional Headroom deployment.** After its separate production approval and memory/CPU budget check, deploy the second container on papi without disturbing the gateway or `cloudflared-9router`. Auto Configure must require no hand-edited server files. Verify start, stop, restart, healthy, unhealthy, and failed-status-check UI states against the real service; a running service must not receive a static setup prompt. **Trace: US-5, US-8.**

10. **FR-10 — Full-surface truth and polish.** Audit and polish every §6 dashboard surface against the rewritten Switchboard Ledger brief. Check mutation responses for combo capacity/strategy, provider toggles, Token Saver, CLI model saves, proxy binding, and log clear; failed saves must not masquerade as persisted success. Failed provider, endpoint-key, quota, Playground, combo, or CLI-status reads must show failure/recovery rather than empty configuration; a failed key read must not create a default key. Clear filters must also clear header search; endpoint mode/reachability claims must be evidence-based. Verify shipped grammar through token inspection and rendered checks: no inherited orange/coral brand tokens, obsolete header, teal-cyan re-skin, or quota-status emoji. **Trace: US-1, US-4, US-9.**

11. **FR-11 — Accessibility and regression floor.** Check every touched surface in both themes for independently verified contrast, visible focus, keyboard operation, responsive layout, and the **44px target floor**, including quota hide/pagination controls, quota-row icons, and Translator expansion/Load controls. All new transitions must respect `prefers-reduced-motion`. Run the full suite against `tests/__baseline__/known-fails.txt` and verify no new failures. **Trace: US-1–US-9.**

## 8. Data model sketch

No migrations are expected unless explicitly stated. Do not introduce a display-label migration or persist detection results as authoritative installation state.

| Area | Representation and constraints |
|---|---|
| CLI detection | No new table. Server-side scan results may be cached in-process or in `kv`; distinguish detected, not detected, and failed checks. Cached results are not persisted truth. |
| Free-lane proxy binding | `proxyPools` already exists. Persist a binding using a `settings` key such as `freeLanePoolId` or a default marker on `proxyPools`; inspect the existing no-auth binding before choosing storage. Q3 fixes strict pool-only egress, not the storage location. Verify the binding reaches the OpenCode free lane specifically. |
| Combo member rename | Q4 fixes `combos.models` as a JSON array of `"<alias>/<model>"` strings. Replace the model ID at the existing index; no schema change, object-array writes, or display-label migration. |
| Free-model retirement | Registry/constants changes only; no DB change. Preserve stored combo/key-policy references and historical usage. The shipped 3.2.2 P6 unknown-ID label helper must continue rendering historical IDs. |
| Headroom | No schema change. Source service state from the existing Headroom status API against the real service on papi; failed status requests are errors, not evidence of absence. Start/stop/restart and Auto Configure must reflect actual operation outcomes. |

## 9. Edge cases

| Case | Expected behavior |
|---|---|
| Every member of the bound pool is down | Hard failure naming the pool and members tried, using the existing “tried: a → b” convention. Never direct egress or silent bypass. |
| Provider refuses a selected model | Preserve shipped routing behavior: rotate through eligible alternatives, then report a specific model-unavailable/provider-refusal error with tried destinations if exhausted; do not change routing policy in this release. |
| Successful read returns only zero rows | Hide the all-zero Trend/breakdown for the selected metric and period; explain genuine “no usage in this period” rather than rendering zero rows. |
| Read fails instead of returning zero rows | Show a failed-load state and recovery, not empty configuration or zero usage. A failed endpoint-key read must not create a default key. |
| One selected metric is zero but another is nonzero | Gate the selected view on its displayed metric; nonzero tokens must not keep an all-zero cost table visible, or vice versa. |
| Period contains some zero days and some meaningful data | Keep the table visible; partial data is not an all-zero period. |
| Mutation response is unchecked, non-successful, or fails in transit | Check the response; do not report “Saved,” enabled, or completed without persistence confirmation. Restore or visibly qualify optimistic state and expose failure. |
| Headroom is not deployed | Report absence and offer functional Auto Configure, subject to the separate production approval and resource-budget gate. |
| Headroom is running but unhealthy | Show real unhealthy status and controls, not an absent-service setup prompt. A failed status check remains distinct from both absence and unhealthiness. |
| One Token Saver stage fails or Headroom is down | Preserve the rest of the page and report per-stage state and measured savings; no whole-page error. |
| Dead model IDs remain in combos or key policies | Preserve rendering and stored references; degrade to “model unavailable” without breaking rendering or routing. Remove retired IDs from selection, not historical usage. |
| CLI config is absent, read-only, or malformed | Report the condition explicitly; never write a half-config. Detection failure must not appear as “not detected.” |
| Two CLI tools share a config file | Preserve both tools’ entries; detection and setup writes must not clobber one another. |
| Combo member rename fails | Keep the ordered position and string-array representation; show failure rather than claiming persistence. Successful rename survives reload. |
| Console Log stays paused for a long period, or clear fails | Bound paused buffering as well as live lines; preserve truthful pause/resume behavior. Failed DELETE must not appear as successful clearing. |
| Key is revealed | Apply confirm-to-reveal and the refreshed secret contract; never expose the raw key in a row’s `title`, component state, or bulk reveal. Verify through the security gate. |
| Filter recovery, theme, keyboard, or reduced-motion use | Clear filters must clear header search too. Check dark/light contrast independently, visible focus, keyboard access, responsive behavior, 44px targets, and `prefers-reduced-motion`. |

## 10. Success metrics

Baselines below are source-derived unless stated otherwise. Rendered behavior and contrast remain unverified pending the browser pass at gate 5 and the vision pass.

| Metric | Baseline | Target | How it is measured |
|---|---|---|---|
| Eight-item delivery | Four items landed in the unreleased tree (FR-3, FR-6, FR-7, FR-8/8b — verify, do not rebuild); CLI guided setup and Headroom guidance partly exist; Token Saver and Console Log unshipped. No-auth binding exists, and live 3.2.5 gateway logs show free-lane egress through the bound pool; re-verify the in-tree strict binding after the `origin/main` reconcile. | All eight functional, with a behavioral assertion for each. | Live development gateway with production-shaped data; screenshots supplement, never replace, assertions. |
| Audit and full-surface polish | Three read-only agents returned source-cited findings; shell/accessibility/navigation, card inventory, picker inventory, and free-lane wiring remain incomplete. | Every §6 surface audited and polished against the refreshed brief; outstanding coverage completed. | `file:line` evidence, browser gate 5, vision pass, and behavioral checks of audit findings. |
| CLI setup | Copy ledger exists; no detection/generated-command layer; catalog count implies installed clients. | At least one tool wired end-to-end from the UI and successfully requesting the local gateway. | Execute generated setup/config instructions and send a request through that tool’s resulting configuration. |
| Strict free-lane proxy | Binding UI can claim success after a failed PATCH; OpenCode free-lane use is unverified. | Bound traffic uses the pool; exhausted pool produces a named hard failure with tried members and no direct fallback. | Verify persisted binding, actual egress, and all-members-down behavior. |
| All-zero Trend/breakdown | Trend gates on tokens or cost rather than the selected metric; Breakdown renders whenever config exists. | 0 all-zero tables rendered across the walk; known-all-zero periods show explanatory empty states. | Exercise each selected metric, all-zero periods, partial periods, failed reads, and not-applicable states. |
| State truth | Audit identifies unchecked mutations and failed reads rendered as empty states. | Failed saves never claim success; failed reads never claim empty configuration or trigger default-key creation. | Failure-path behavioral assertions for every cited mutation/read and recovery action. |
| Headroom operation | Not deployed on papi; failed status checks can masquerade as absence. | Approved second-container deployment; functional Auto Configure and truthful start/stop/restart, healthy/unhealthy/error states without disturbing existing services. | Separate approval and memory/CPU budget check; verify against papi while checking gateway and `cloudflared-9router` continuity. |
| Identity and canonical brief | Switchboard Ledger shipped in 3.0.0; repo-root brief is obsolete 1.1.0 content. | `DESIGN.md` rewritten in place; zero inherited orange/coral brand tokens; no obsolete header or teal-cyan re-skin. | Inspect token files and rendered themes; verify refreshed grammar, including no quota-status emoji. |
| Accessibility | Source audit identifies 24px, 32×32, and 40×40 controls and missing explicit focus styling; contrast unverified. | Contrast, focus, keyboard, responsive layout, 44px target floor, and reduced motion pass on every touched surface in both themes. | Independent theme contrast checks and keyboard/responsive/reduced-motion walks. |
| Secret handling | Raw revealed endpoint key also enters the row’s `title`. | No tooltip exposure; reveal behavior satisfies the refreshed secret contract. | Security-gate inspection and behavioral verification. |
| Regression | Existing failures recorded in `tests/__baseline__/known-fails.txt`. | No new failures. | Run the full suite against the baseline. |

## 11. Decisions (answered by the operator 2026-10-25)

| q | question | answer |
|---|----------|--------|
| Q1 | MVP scope | **Full DESIGN.md too.** 3.3.0 = items 1–8 + brand swap **+** the rest of `DESIGN.md`: sidebar regroup into Operate/Observe/System, media-providers accordion → flat tabs, and the component contracts not touched by items 1–8. Scope and QA walk approximately triple; §6's "v2" bucket is promoted into the MVP. |
| Q2 | What One-Click Setup means | **Wizard over our CLI Tools page** — auto-detect installed CLI apps, per-tool setup action, generated copy-paste command, exact config paths, built over the existing tool cards. Not a bykitsune card. |
| Q3 | Free-lane proxy behaviour | **Strictly the pool, never direct.** If every member of the bound pool is down, free-lane requests fail loudly rather than exposing the server's own IP. No direct fallback, no silent bypass. |
| Q4 | Combo inline rename | **Rename the model id in place.** `combos.models` stays a JSON array of `"<alias>/<model>"` strings; no schema change, no display-label migration. |
| Q5 | Headroom on papi | **Deploy on papi as a second container.** This is a new production process on the box that already runs the gateway and `cloudflared-9router` — it gets its own approval gate and a memory/CPU budget check before it lands, and it must never disturb the gateway or cloudflared. |

Consequences to carry into the Design Brief:

- Q1 promotes the sidebar regroup, media-providers flattening and the remaining component
  contracts into 3.3.0 — the brief must cover every dashboard surface, not just the 8 items.
- Q3 makes the "pool down" case a **hard failure with the pool named**, not a fallback; the
  error must state which pool and which members were tried (matching the shipped combo
  failure convention, `tried: a → b`, and the §9 edge cases).
- Q5 adds a production-deployment surface; the UI must show a real unhealthy state and must
  not present a static "set this up" prompt when the service is running.
- No open questions remain. The Design Brief is unblocked.

## 11a. Original questions (kept for the record)

**Q1 — MVP scope.** Is 3.3.0 = items 1–8 + brand swap (my proposal), or does it also carry
the full `DESIGN.md` (sidebar regroup, media-providers flattening, the untouched component
contracts)? The latter roughly triples the surface area and the QA walk.

**Q2 — What "One-Click Setup" means.** Adopt the bykitsune wizard pattern for *our* CLI
Tools page (auto-detect installed apps → per-tool setup → generated command), or add
*bykitsune itself* as a card/provider under CLI Tools? I read the reference as the former;
the record reads ambiguously.

**Q3 — Free-lane proxy binding.** Where should the pool binding live (a `settings` key vs a
flag on `proxyPools`), and should free-lane traffic *fail over* across pool members and
direct-vs-pool, or is it strictly "all free-lane egress goes through the pool"?

**Q4 — Combo "inline rename".** Rename the *model id* of a member entry in place, or give a
member a *display label* (which implies changing `combos.models` from strings to objects)?

**Q5 — Headroom on papi.** Deploy the Headroom service as a second container on papi (a new
production process, needs an approval gate and a resource budget on a box that also runs the
gateway and cloudflared), or for 3.3.0 only wire the UI + Auto Configure against a service
you run yourself?

## 11b. Corrected scope question — ANSWERED

**Answer: (B) Audit + the eight items + refreshed brief + a full-surface polish pass**,
and **`DESIGN.md` is rewritten in place** with the refreshed Switchboard Ledger brief
(one canonical design doc kept in the repo).

So 3.3.0 is:

1. **Audit** every shipped Switchboard Ledger surface (the "check" half) — findings with
   file:line evidence, not impressions.
2. **Ship the eight named items** (§5), making the two 3.0.0 placeholders (CLI guided setup,
   Headroom one-click "guidance only") actually functional.
3. **Polish pass** over all dashboard surfaces against the refreshed brief — density,
   empty/loading/error/success/offline states, responsive, a11y — fixing what the audit
   finds, not only the eight items.
4. **Rewrite `DESIGN.md`** to document the Switchboard Ledger grammar as shipped, plus the
   per-surface specs for the above. The obsolete 1.1.0 teal-cyan/"operations console"
   brief is retired; nothing re-skins to it.
5. `cli/` stays `1.0.0`; version goes to 3.3.0 at release time.

### Original options (kept for the record)

Given §0.2, "Full DESIGN.md too" cannot be taken literally — `DESIGN.md` predates the
shipped 3.0.0 redesign. Three honest options:

- **(A) Audit + the eight items + a refreshed brief.** 3.3.0 = audit the current
  Switchboard Ledger surfaces, ship the eight items, and write a new design brief that
  documents the Switchboard Ledger grammar (replacing the obsolete `DESIGN.md`). No
  re-skin. *Recommended — this is the smallest change that matches what "UI/UX
  check/redesign" means for a shipped product.*
- **(B) A + full-surface polish pass.** As (A), plus a systematic pass over every dashboard
  surface against the refreshed brief (density, states, a11y) with fixes for whatever the
  audit finds — not just the eight items.
- **(C) Deliberate re-skin to `DESIGN.md`'s teal-cyan "operations console".** Reverses the
  3.0.0 Switchboard Ledger identity. Only correct if the operator wants to abandon that
  design, and it invalidates the "no new palette without updating this file first" rule in
  the current `DESIGN.md` §7 rather than satisfying it.

## 12. Not covered / explicitly deferred

- Routing semantics, fallback policy, cache, and translators: backend work tracked in `TARGET.md`; 3.2.2 routing correctness is shipped and live.
- New upstream providers or models beyond retiring dead free-lane IDs; auth/session redesign, SSO, multi-user support, and roles.
- Mobile-native application; retain and verify the existing responsive web layout.
- Separate first-run onboarding wizard for Persona B, virtualized lists of 50+ rows, and fork-derived `docs/FEATURES.md` items: not scheduled.
- Reimplementation of the obsolete 1.1.0 teal-cyan “operations console” palette or navigation. Rewrite `DESIGN.md` for Switchboard Ledger; do not reverse the shipped 3.0.0 identity.
- Papi cleanup of dead `ohh` / `grip` / `gpt-6-sol` combo members: a separate live-data mutation awaiting its own approval.
- Automatic authorization of production changes: Headroom is in scope, but its second-container deployment requires its own approval and memory/CPU budget check.
- Committing `labs/` artifacts, agent-memory files, or pre-existing unrelated dirt in `PROJECTS/STATUS.md`; leave unrelated changes uncommitted.
- Treating OCR as visual verification: no image-input model was available in the original session. Exact bykitsune reference spacing/typography remains uncaptured; perform a vision-capable pass over `labs/p6-usage-breakdown/03..05` before the CLI Tools layout brief locks.
- A `cli/` version bump: it stays `1.0.0`; the product version becomes `3.3.0` at release.
