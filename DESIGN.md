# DESIGN.md — Switchboard Ledger
Status: Canonical brief for the shipped design system and 3.3.0 work.
Supersedes: The obsolete 1.1.0 “operations console” brief; no teal-cyan re-skin.
Authority: `src/app/globals.css`, `src/shared/components/Sidebar.js`; `audit/findings.md` for divergences.
Date: 2026-10-25

---

## 1. Purpose and How to Use This Document
Document the Switchboard Ledger system shipped in v3.0.0, not a replacement identity.
Use it to specify the eight release items and review every dashboard surface during the 3.3.0 polish pass.
Treat shipped grammar, audited defects, and required changes as distinct; a defect is not a design precedent.
Verify implementation against source; rendered behaviour and contrast ratios remain unverified in the supplied audit.
Record missing specifications in Open Questions rather than inventing tokens or behaviour.

## 2. Product Context

| Subject | Context |
|---|---|
| KRouter9 | A gateway that routes coding-agent traffic through `/v1`, with dashboard surfaces for provider connections, routing combinations, endpoint keys, usage, quotas, and supporting configuration. |
| Persona A — the operator | Primary and only current user. Runs KRouter9 on a VPS behind Cloudflare, with 296 connections across approximately 20 providers and real coding-agent traffic. Works at a desk in the dark theme; needs dense, aligned data, verifiable status, and fast answers without decorative chrome. |
| Persona B — the new self-hoster | Secondary and not yet a real user. Has cloned and started the gateway and wants to connect Claude Code, Codex CLI, OpenCode, or Cline without first learning what a provider connection means. Needs a working tool in about two minutes; CLI setup deserves explicit attention, while a separate first-run onboarding wizard is not scheduled. |
| Interface job | Let the user see where traffic goes, compare accounts and spend, and change routing without guessing whether the displayed state is true. |

## 3. Design Principles

| # | Principle | Rationale |
|---|---|---|
| 1 | Tell the truth about state. | Routing changes must not appear saved after failed mutations, and failed account or usage reads must not masquerade as empty results. |
| 2 | Use one interactive accent. | Glacier blue identifies actions; semantic colors identify state, keeping routing controls distinct from account health and spend signals. |
| 3 | Make comparable numbers comparable. | Commit Mono with tabular numerals and slashed zero is required for vertically comparable numbers so account usage and spend can be scanned reliably. |
| 4 | Preserve working density. | Compact `2.5rem` table rows and default `3.5rem` list rows support comparison across many provider connections without decorative spacing. |
| 5 | Build hierarchy with surfaces and borders. | Carbon surface steps and hairline borders separate routing and spend information without competing shadows; cards remain sm/md, not rounded bubbles. |
| 6 | Make meaning survive without color. | State labels carry meaning and 12% washes only reinforce it, so account health and routing failures remain understandable without hue alone. |
| 7 | Keep orientation and feedback direct. | Operate changes routing, Observe reads its results, and System configures its foundations; short directional motion, without loops or bounce, preserves attention on traffic and spend. |

## 4. Visual Direction

Switchboard Ledger treats the dashboard as a dense working record of routing decisions, account state, and measured usage. Green-tinted carbon neutrals establish the canvas, rail, and surface hierarchy; a single glacier-blue ramp identifies interaction. Atkinson Hyperlegible Next supports small UI text, while Commit Mono makes comparable data legible in columns. Flat surfaces, restrained sm/md card radii, hairline borders, uppercase labels, and short directional transitions provide structure without decorative depth. The shipped navigation uses Operate, Observe, and System; audited departures from this grammar are defects to resolve, not a second visual language.

### Avoid List

| Must Never Look Like | Reason |
|---|---|
| The retired teal-cyan “operations console” | Re-adopting the obsolete 1.1.0 identity reverses the shipped v3.0.0 system. |
| A pure-gray dark dashboard | Carbon is a green-tinted warm-neutral family; generic gray discards the shipped surface hierarchy. |
| A multicolor action palette | Glacier is the only interactive accent; semantic colors must not become competing calls to action. |
| A decorative status-light display | Green, amber, rose, and sky communicate state, not ornament; labels must carry the meaning. |
| An emoji-based quota scoreboard | The audited traffic-light emoji treatment diverges from the ledger signal grammar. |
| A stack of floating, shadowed cards | Depth comes from surface steps and borders; default shadows are none, with float and drag reserved for their specific uses. |
| A collection of large rounded bubbles | Cards use sm/md radii; lg-rounded bubbles contradict the shipped shape language. |
| A spacious showcase that hides operational rows | Density supports comparing many accounts; excess whitespace obstructs the operator’s working view. |
| A proportional-number usage report | Comparable columns require Commit Mono and tabular numerals to support accurate account and spend comparison. |
| A color-only health monitor | Washes are hints, not sufficient state communication; routing and account states need labels. |
| An animated ambient display | Motion is short and directional; looping or bouncing distracts from routing traffic and reading spend. |
| An authoritative-looking report built from unknown or failed data | Empty accounts, all-zero usage tables, and success claims must not conceal failed reads, inappropriate data gates, or unchecked saves. |
| A setup screen that implies capabilities it does not provide | The audited CLI surface supplies copyable guidance, not one-click setup; catalog counts do not establish installed applications. |

## 5. Design tokens

### Carbon Primitives

| Token | Exact hex | Role |
|---|---|---|
| `--p-carbon-1000` | `#070908` | Rail; code background |
| `--p-carbon-950` | `#0B0D0C` | Canvas; on-primary text |
| `--p-carbon-900` | `#111411` | Card surface |
| `--p-carbon-850` | `#171B17` | Raised surface |
| `--p-carbon-800` | `#1E241D` | Strong surface; hover; subtle border |
| `--p-carbon-700` | `#2A3228` | Border |
| `--p-carbon-600` | `#3A4637` | Strong border |
| `--p-carbon-400` | `#879483` | Subtle text |
| `--p-carbon-300` | `#AFBAAB` | Muted text |
| `--p-carbon-50` | `#F7F8F4` | Text |

### Glacier Primitives

| Token | Exact hex | Role |
|---|---|---|
| `--p-glacier-200` | `#BBDFFB` | Primary hover |
| `--p-glacier-300` | `#8FCBF7` | Primary |
| `--p-glacier-400` | `#6FB9F2` | Primary active |

### Semantic Aliases

| Semantic role | Primitive | Exact hex | Use |
|---|---|---|---|
| Primary | `--p-glacier-300` | `#8FCBF7` | Interactive accent |
| Primary hover | `--p-glacier-200` | `#BBDFFB` | Hovered primary interaction |
| Primary active | `--p-glacier-400` | `#6FB9F2` | Active primary interaction |
| On-primary | `--p-carbon-950` | `#0B0D0C` | Content on primary |
| Success | `--p-emerald-400` | `#34D399` | Success state only |
| Warning | `--p-amber-400` | `#FBBF24` | Warning state only |
| Danger | `--p-rose-400` | `#FB7185` | Danger state only |
| Info | `--p-sky-400` | `#38BDF8` | Informational state only |

`--p-glacier-300` is the single interactive accent: blue identifies where the user can act, while semantic colors communicate state rather than competing calls to action. Semantic colors have matching `*-wash` treatments at 12% color-mix; primary also has a 42% `*-border`. No other tint percentages exist. Washes reinforce labels, never replace them.

### Type Faces, Scale, and Tracking

| Face | Token | Application |
|---|---|---|
| Atkinson Hyperlegible Next | `--font-ui` | UI text |
| Commit Mono | `--font-data` | Comparable numbers; code, pre, kbd, samp, `.font-mono`; tabular-nums and slashed-zero |

| Scale | Size / line-height, rem | Available weights |
|---|---|---|
| micro | .6875 / 1 | 400 / 500 / 600 / 700 |
| xs | .75 / 1 | 400 / 500 / 600 / 700 |
| sm | .875 / 1.25 | 400 / 500 / 600 / 700 |
| md | 1 / 1.5 | 400 / 500 / 600 / 700 |
| lg | 1.125 / 1.5 | 400 / 500 / 600 / 700 |
| xl | 1.375 / 1.75 | 400 / 500 / 600 / 700 |
| 2xl | 1.75 / 2.125 | 400 / 500 / 600 / 700 |
| 3xl | 2.25 / 2.5 | 400 / 500 / 600 / 700 |

| Tracking | Value | Use |
|---|---|---|
| tight | -.02em | Tight tracking |
| normal | 0 | Normal tracking |
| label | .08em | Uppercase labels |
| micro | .12em | Eyebrow and micro labels |

### Spacing, Layout, and Heights

| Spacing step | rem | Spacing step | rem |
|---|---|---|---|
| 0 | 0 | 1 | .25 |
| 2 | .5 | 3 | .75 |
| 4 | 1 | 5 | 1.25 |
| 6 | 1.5 | 8 | 2 |
| 10 | 2.5 | 12 | 3 |
| 16 | 4 | 20 | 5 |

| Constant | Value | Constant | Value |
|---|---|---|---|
| Base spacing unit | 4px | Rail width | 14.5rem |
| Workbar height | 4rem | Content maximum | 90rem |
| Reading maximum | 48rem | Desktop page padding | 2rem |
| Tablet page padding | 1.5rem | Mobile page padding | 1rem |
| Control sm | 2rem | Control md | 2.5rem |
| Control lg | 3rem | Touch minimum | 2.75rem |
| Row compact | 2.5rem | Row default | 3.5rem |
| Row comfortable | 4.5rem | | |

### Shape, Depth, Focus, and Motion

| Token or role | Value | Contract |
|---|---|---|
| Radius xs / sm / md / lg / pill | .1875 / .375 / .5 / .75 / 999 | Shipped radius scale |
| Brand radius / brand-lg | sm / md | Cards use sm/md, never lg-rounded bubbles |
| Hairline border | 1px | Default separation |
| Emphasis border | 2px | Selected and active states |
| `--shadow-soft` / `--shadow-warm` | none | Flat by default |
| `--shadow-float` | Offset 0, 12px; blur 36px; black at 28% opacity | Modals and popovers only |
| `--shadow-drag` | Offset 0, 8px; blur 22px; black at 22% opacity | Dragged items only |
| Focus ring | Offset 0, 0; blur 0; spread 3px; `--color-primary-border` | Ring, never an outline swap |
| Instant / fast / base / slow | 80ms / 120ms / 180ms / 260ms | Short, directional motion; no loops or bounce |
| Standard easing | cubic-bezier(.2,0,0,1) | Standard transition |
| Enter easing | cubic-bezier(.16,1,.3,1) | Entry transition |
| Exit easing | cubic-bezier(.4,0,1,1) | Exit transition |

## 6. Typography rules

1. **Separate UI from data.** Use Atkinson Hyperlegible Next through `--font-ui` for interface text and Commit Mono through `--font-data` for data and code.
2. **Align comparable numbers.** Every number compared vertically must use Commit Mono with tabular-nums and slashed-zero; proportional UI numerals do not belong in comparable columns.
3. **Keep labels explicit.** Labels are uppercase with .08em tracking; eyebrow and micro labels use .12em tracking.
4. **Let three weights carry hierarchy.** Use three weights for hierarchy, drawn only from the shipped 400 / 500 / 600 / 700 set. Open Questions: the supplied facts do not establish which three weights or their role mapping.
5. **Bound reading width and minimum size.** Cap prose at the 48rem reading maximum. Do not set text below micro: .6875rem with 1rem line-height.

## 7. Screen inventory

Density below is the brief's target: compact = `2.5rem`, default = `3.5rem`, comfortable = `4.5rem`. It does not assert audited row-height compliance. Primary actions describe the surface's intended job, not proof that every action works today. Unestablished routes and controls remain Open Questions.

### Operate

| Route | Surface | Job in one line | Primary action | Density |
|---|---|---|---|---|
| `/dashboard/basic-chat` | Playground | Exercise routing with a request. | Send a request | Default |
| `/dashboard/endpoint` | Endpoint & Key | Inspect endpoint access and manage gateway keys. | Manage keys | Compact |
| `/dashboard/providers`; `/dashboard/providers/[id]` | Providers | Manage provider connections and their routing availability. | Add a connection | Compact |
| `/dashboard/combos` | Combos | Configure ordered route members and routing strategy. | Manage route | Compact |

### Observe

| Route | Surface | Job in one line | Primary action | Density |
|---|---|---|---|---|
| Open Questions: route not established | Usage | Compare recorded traffic, tokens, and cost without implying unsupported measurements. | Inspect usage | Compact |
| Open Questions: route not established | Quota Tracker | Inspect provider limits and connection quota state. | Inspect quotas | Compact |
| Open Questions: full route not established; `token-saver/TokenSaverClient.js` | Token Saver | Configure saving stages and inspect savings evidence and Headroom status. | Configure stages | Default |
| Open Questions: full route not established; `console-log/ConsoleLogClient.js` | Console Log | Inspect request activity and failures. | Inspect live logs | Compact |
| Open Questions: full route not established; `translator/page.js` | Translator | Inspect translation stages. | Expand a stage | Default |

### System

| Route | Surface | Job in one line | Primary action | Density |
|---|---|---|---|---|
| `/dashboard/proxy-pools` | Proxy Pools | Configure the pools used for proxied routing. | Configure a pool | Compact |
| Open Questions: route not established | Media | Provide the shipped Media surface; detailed task coverage remains unverified. | Open Questions: action not established | Default |
| Open Questions: route not established | Skills | Provide the shipped Skills surface; detailed task coverage remains unverified. | Open Questions: action not established | Default |
| Open Questions: full route not established; `cli-tools/CLIToolsPageClient.js` | CLI Tools | Connect an existing CLI application to the gateway. | Set up a tool; wizard is release work | Default |
| Open Questions: route not established | Settings | Configure gateway settings. | Change settings; specific controls unverified | Default |

### Shell

| Route | Surface | Job in one line | Primary action | Density |
|---|---|---|---|---|
| Across dashboard routes | Rail | Navigate Operate, Observe, and System; rail collapsed by default. | Open a destination | Default |
| Across dashboard routes | Workbar | Provide the shared `4rem` workbar; control inventory remains unverified. | Open Questions: controls not established | Default |
| Open Questions: placement and route not established | Gateway-state | Required: distinguish verified gateway health from unavailable status checks. | Open Questions: verification and recovery controls | Default |

## 8. Key flows

These are required release flows, not claims of shipped capability. The supplied audit is source-derived; rendered behaviour remains unverified.

### 1. Add a Provider Connection and Prove It Routes

| Step / decision point | Required path and evidence |
|---|---|
| Enter — connection data available? | Open Providers and the provider detail. A failed connection fetch must show a failure, not an empty connection list. |
| Add — save accepted? | Submit the connection; check the mutation response before presenting saved state. Failure must remain distinguishable from success. |
| Exercise — request succeeds? | Use Playground or the gateway `/v1` endpoint to send a request through the intended routing configuration. Provider-list failure must not become “No providers connected yet.” |
| Prove — intended connection used? | Correlate the request with available routing evidence in Console Log and Usage; a saved connection alone is not routing proof. |
| Open Questions | Add-connection form contract and exact request-to-connection evidence fields are not established. |

### 2. Set Up a CLI Tool End-to-End — Persona B

| Step / decision point | Required path and evidence |
|---|---|
| Select — target application supported? | Find the tool through search over the existing CLI Tools cards; do not describe the entire catalog as installed applications. |
| Detect — installed, absent, or check failed? | Run the required detection layer with an explicit target list. A failed status request must remain a failed check, not an installation verdict. |
| Configure — which install mode and destination? | Follow auto-detect → install mode → done; show the exact configuration path and generated copy-paste setup command. Build over existing cards. |
| Execute — setup actually completed? | The user runs the generated command; copying guidance is not completion. Check the resulting configuration and tool status before claiming success. |
| Verify — tool routes through the gateway? | Make a request from the configured CLI and verify gateway routing evidence. Detection, wizard, and command generation are release work; the audited surface is a copy ledger. |
| Open Questions | Detection mechanism, execution environment, supported-target inventory, and completion checks are not established. |

### 3. Investigate a Failing Request

| Step / decision point | Required path and evidence |
|---|---|
| Locate — request evidence available? | Inspect Console Log; distinguish missing evidence from a failed read. Pausing must not leave an uncapped buffer. |
| Classify — routing, connection, quota, or service failure? | Follow available evidence to Combos, Providers, Quota Tracker, or Headroom status; do not infer the cause from color alone. |
| Compare — selected metric has meaningful data? | Gate Trend on its selected metric; suppress all-zero Breakdown rather than presenting it as authoritative. Do not present token-apportioned component costs as measured provider charges. |
| Recover — change persisted and retry succeeded? | Check mutation responses, retry the request, and verify fresh evidence. Do not treat a local toggle change as recovery. |
| Open Questions | Request correlation fields, error taxonomy, and cross-surface navigation coverage remain unverified. |

### 4. Bind the OpenCode Free Lane to a Proxy Pool

| Step / decision point | Required path and evidence |
|---|---|
| Bind — pool assignment persisted? | Select the pool through the existing no-auth binding control; show “Saved” only after a successful PATCH. |
| Route — binding reaches the free lane? | Verify a free-lane request uses the bound pool. The control exists; its free-lane wiring remains unverified. |
| Exhaust — any pool member succeeds? | If every member is down, fail loudly with the pool named and the attempted members identified. Never fall back to direct traffic or silently bypass the pool. |
| Verify — failure preserves isolation? | Exercise the all-members-down case and confirm no direct request exposes the server's own IP. |
| Open Questions | Free-lane binding integration and the evidence used to verify absence of direct fallback remain unestablished. |

### 5. Deploy and Verify Headroom

| Step / decision point | Required path and evidence |
|---|---|
| Approve — production deployment permitted? | Obtain the separate deployment approval and check memory/CPU budget before adding the second container on papi. Do not disturb the gateway or `cloudflared-9router`. |
| Configure — Auto Configure completed? | Use the required setup path; existing guidance alone is not deployment evidence. |
| Check — absent, running, unhealthy, or status unavailable? | Read real service status. A failed check must not become “not installed”; a running service must not retain a static setup prompt. |
| Verify — service and gateway remain healthy? | Verify Headroom operation and continued gateway and Cloudflare tunnel operation before declaring completion. |
| Open Questions | Resource budget values, deployment commands, Auto Configure contract, and health acceptance checks are not supplied. |

### 6. Rename a Combo Member in Place

| Step / decision point | Required path and evidence |
|---|---|
| Select — member or combo name? | Open Manage route and edit the member's model ID, not the combo name or the Create Combo modal. In-place member editing is currently absent. |
| Edit — identifier accepted? | Preserve `combos.models` as a JSON array of `"<alias>/<model>"` strings; no schema or display-label migration. |
| Save — mutation accepted? | Check the response before claiming success; preserve member order and avoid remove-and-re-add. |
| Verify — persisted route matches? | Read back the saved route and verify the intended member ID remains in its original position. |
| Open Questions | Identifier validation rules and the inline editor's commit/cancel interaction are not established. |

## 9. Per-surface layout specs

The following are 3.3.0 requirements, not claims that the audited UI already meets them.

### 9.1 CLI Tools — One-Click Setup

| Aspect | Spec |
|---|---|
| Layout regions | Search and detection status above the existing tool cards; selected tool opens a three-step flow: auto-detect → install mode → done. Show the exact destination config path and generated copy-paste command before completion. |
| Density | Default card rows; compact, aligned status and config-path details. |
| Primary vs secondary | Primary: set up the selected tool. Secondary: inspect detection results, copy the command, and review the config path. “Done” requires a completion check, not a copy event. |
| Component variants | sm/md flat cards with hairline borders; labeled installed, absent, and check-failed states. Use Commit Mono for paths and commands. |
| Must not | Count the full catalog as “installed clients,” call the existing copy ledger one-click setup, or treat a failed status request as an installation verdict. |
| Finding addressed | `cli-tools/CLIToolsPageClient.js:29-34,50-68`; `cli-tools/[toolId]/ToolDetailClient.js:208-255`. |

### 9.2 Free Lane + Proxy Pools

| Aspect | Spec |
|---|---|
| Layout regions | Keep pool configuration in Proxy Pools and the existing no-auth binding control at provider detail; show the bound pool and its save state beside that control. Expose attempted members in the free-lane failure state. |
| Density | Compact pool/member rows; default-height binding control. |
| Primary vs secondary | Primary: bind a pool and verify a free-lane request through it. Secondary: inspect member availability and attempted-member evidence. |
| Component variants | Flat bordered pool rows; labeled success or danger state with the matching 12% wash. Show “Saved” only after a successful PATCH. |
| Must not | Route directly when a bound pool is exhausted or bypass it silently. Hard failure must name the pool and every member tried. |
| Finding addressed | `shared/components/NoAuthProxyCard.js:39-61`; free-lane wiring remains unverified. |

### 9.3 Token Saver

| Aspect | Spec |
|---|---|
| Layout regions | Separate stage controls, compression-pipeline detail, current savings evidence, and the Headroom setup/status rail. Keep PXPIPE, Output compression, Caveman, and Ponytail individually identifiable. |
| Density | Default rows for stage controls; compact aligned numbers in savings evidence. |
| Primary vs secondary | Primary: change a stage and confirm persistence. Secondary: inspect pipeline detail, savings evidence, and Headroom status. |
| Component variants | Flat sm/md sections and labeled state rows; Commit Mono for comparable savings values. Distinguish service absent, running, unhealthy, and check failed. |
| Must not | Show a locally toggled setting as saved before response success, or turn an unavailable Headroom check into “not installed.” |
| Finding addressed | `token-saver/TokenSaverClient.js:65-75,112-121,131-187,480-510`. |

### 9.4 Console Log

| Aspect | Spec |
|---|---|
| Layout regions | Keep stream controls and stream state adjacent to compact log rows; place clear confirmation at the action, and show Headroom status separately from log evidence. |
| Density | Compact log rows; comparable values in Commit Mono. |
| Primary vs secondary | Primary: inspect live request activity. Secondary: pause/resume and clear with confirmed results; inspect Headroom without implying its status from log silence. |
| Component variants | Flat bordered rows and labeled live, paused, failed, and empty states; danger treatment is reserved for failure, not decoration. |
| Must not | Grow the paused buffer without a bound, close clear confirmation as success after a failed DELETE, or equate missing logs with a healthy service. |
| Finding addressed | `console-log/ConsoleLogClient.js:66-72,95-105`. |

### 9.5 Usage — Trend and Breakdown

| Aspect | Spec |
|---|---|
| Layout regions | Put metric selection with Trend; render its table only against the selected metric’s data state. Place Breakdown with its value labels and measurement basis. |
| Density | Compact, aligned data rows; comparable numbers in Commit Mono. |
| Primary vs secondary | Primary: select and compare a metric. Secondary: inspect Breakdown and how component costs were derived. |
| Component variants | Flat bordered data sections; distinct loading, failed, unavailable, zero, and populated states with text labels. |
| Must not | Use `tokens || cost` to admit an all-zero table for the selected metric, render an all-zero Breakdown as authoritative, or label token-apportioned costs as measured provider charges. |
| Finding addressed | `usage/components/UsageChart.js:57,67,132-134`; `usage/components/UsageDashboard.js:121-129,262`. |

### 9.6 Combos — Inline Member Rename

| Aspect | Spec |
|---|---|
| Layout regions | Keep the editor in each Manage route member row, alongside the existing move/remove actions; keep combo-name editing separate. |
| Density | Compact member rows; editing must preserve the row’s position in the route. |
| Primary vs secondary | Primary: edit a member’s model ID in place and confirm persistence. Secondary: move, remove, or cancel the edit. |
| Component variants | Flat bordered rows; selected/editing emphasis border and a labeled save-error state. Store `combos.models` as the existing JSON array of `"<alias>/<model>"` strings. |
| Must not | Require remove-and-re-add, rename the combo instead of its member, change the schema, or claim success without checking the save response. |
| Finding addressed | `dashboard/combos/page.js:464-505,100-108,193-213`; the Create Combo rename control at `dashboard/combos/page.js:653-670` is not this editor. |

### 9.7 OpenCode Free Models — Retire Dead IDs

| Aspect | Spec |
|---|---|
| Layout regions | Separate selectable registry models from stored or previously used IDs in OpenCode model controls; show the status of a stored ID where it appears in a picker. |
| Density | Compact model rows; keep full IDs legible in Commit Mono. |
| Primary vs secondary | Primary: select a currently supported free model. Secondary: inspect and replace an unavailable stored ID. |
| Component variants | Flat bordered rows with text-labeled selectable and unavailable states; state wash may reinforce, not replace, the label. |
| Must not | Offer a retired ID as a working choice, silently delete a stored reference, or infer retirement solely from an ID’s absence from the registry. |
| Finding addressed | No file:line defect established for registry reconciliation; the supplied scope identifies stored `nemotron-3-super-free` and `deepseek-v4.1-flash-free` as absent from the registry. |

### 9.8 Headroom — Second Container on papi

| Aspect | Spec |
|---|---|
| Layout regions | Show real service status and Auto Configure progress in the Headroom rail; keep deployment approval, resource checks, and gateway/tunnel verification visible as distinct gates. |
| Density | Default status rows; compact, aligned health evidence. |
| Primary vs secondary | Primary: Auto Configure after separate production approval and memory/CPU budget check. Secondary: inspect health and retry an unavailable status check. |
| Component variants | Flat bordered status rows with labeled absent, running, unhealthy, and check-failed states; use the corresponding semantic wash only as reinforcement. |
| Must not | Show a static “set this up” prompt while the service is running, equate a failed check with absence, or disturb the gateway or `cloudflared-9router` while deploying the second container. |
| Finding addressed | `token-saver/TokenSaverClient.js:131-187,480-510`; production health and resource acceptance checks remain unestablished. |

### 9.9 Remaining Audited Surfaces — Polish Pass

| Aspect | Spec |
|---|---|
| Layout regions | Keep read-error and retry states where data would otherwise appear; keep save-error feedback beside the action. Apply across Providers, Endpoint & Key, Playground, Combos, Quota Tracker, CLI Tools, and Console Log. |
| Density | Preserve compact table rows and default list rows; do not spend row space on a false empty state. |
| Primary vs secondary | Primary: complete and verify the surface’s main task. Secondary: retry failed reads, clear filters, or inspect the failed mutation without losing entered work. |
| Component variants | Flat bordered rows and explicit loading, empty, failed, saved, and unsaved labels; semantic washes reinforce text. Restore the shipped focus ring and `2.75rem` touch minimum where audited controls fall short. |
| Must not | Treat unchecked mutation responses as success or failed reads as empty data; put a revealed raw key in a `title` attribute. Route the key defect to the security gate. |
| Findings addressed | Unchecked saves: `dashboard/providers/page.js:242-258`, `cli-tools/components/OpenCodeToolCard.js:77-96`. Failed reads: `dashboard/providers/[id]/page.js:328-383`, `dashboard/endpoint/EndpointPageClient.js:401-426`, `usage/components/ProviderLimits/index.js:232-239,814-827`, `dashboard/basic-chat/BasicChatPageClient.js:243-261`, `dashboard/combos/page.js:263-269`. Key exposure: `dashboard/endpoint/EndpointPageClient.js:916`. |
| Further polish | Clear all active filters at `dashboard/providers/page.js:489-490`; distinguish checked reachability from static claims at `dashboard/endpoint/EndpointPageClient.js:877,894`; address undersized or unclear-focus controls at `usage/components/ProviderLimits/QuotaTable.js:240-247,266-279`, `usage/components/ProviderLimits/index.js:1203-1259`, and `translator/page.js:227-228`; replace emoji status signals at `usage/components/ProviderLimits/QuotaTable.js:46-70,165-171`. |

## 10. Component library

Contracts below are 3.3.0 requirements using shipped Switchboard Ledger tokens, not claims of audited compliance. Unspecified treatments remain Open Questions.

| Component | Variants / dimensions | Required states and contract |
|---|---|---|
| Button | primary / secondary / ghost / danger × sm `2rem` / md `2.5rem` / lg `3rem` | Every combination: default / hover / active / focus / disabled / loading. Preserve `2.75rem` minimum touch target. Primary uses glacier primary / hover / active; focus uses the shipped 3px primary-border ring. Label pending work; prevent duplicate submission. |
| Field | UI text; data values in Commit Mono | Empty / populated / focus / invalid / disabled / saving. Keep label, entered value, and field-specific error available; do not erase input after failure. |
| Select | Selection control; comparable values in Commit Mono | Loading / empty / selected / focus / disabled / failed. Failed option loading is not an empty option set. |
| Toggle | Boolean setting | On / off / focus / disabled / saving / failed. Do not present a local change as persisted before checking the response; expose failure and the persisted state. |
| StatusPill | State label with matching semantic 12% wash | Text carries meaning; color is reinforcement only. State colors never become a second interactive accent. |
| StatusPill: auth-invalid | Error class label | Preserve the class in text; do not collapse it into an empty configuration or an unsupported recovery claim. |
| StatusPill: refresh-invalid | Error class label | Distinguish from auth-invalid; preserve available error evidence. |
| StatusPill: ratelimited | Error class label | Distinguish from network failure; show retry timing only when supplied by the response. |
| StatusPill: network | Error class label | Identify unavailable communication; do not infer absent resources or invalid credentials. |
| StatusPill: unknown | Error class label | Preserve uncertainty; do not manufacture a more specific cause. |
| Table row | Compact `2.5rem` / default `3.5rem` / comfortable `4.5rem` | Default / hover / selected / editing / saving / failed. Comparable numbers use Commit Mono with tabular figures; selected/active emphasis uses `2px` borders. |
| Card | sm/md radius; surface / raised | Loading / populated / empty / failed / partial. Surface step plus hairline border establishes depth; no default shadow or lg-rounded bubbles. |
| Modal | Floating surface | Open / focus / submitting / failed / complete. Use `--shadow-float`; retain errors and entered work after failed submission. Focus containment and restoration require verification. |
| Drawer | Panel contract | Open / loading / populated / failed / saving. Apply shipped surfaces, borders, and focus ring; placement, dimensions, and depth treatment remain Open Questions. |
| Toast | Mutation or operation feedback | Pending / success / error. Success follows a checked response, never an optimistic local update; critical errors must remain available at the affected action. |
| EmptyState | Confirmed absence / no filter matches | Render only after a successful read establishes absence. Recovery must address the actual cause; clearing filters must also clear search. |
| Skeleton | Loading placeholder | Initial loading / replacement by result or error. Do not imply zero values or successful absence; treatment and animation remain Open Questions. |
| CodeBlock | Commit Mono; carbon-1000 background | Populated / unavailable / failed. Preserve exact commands, paths, and identifiers; comparable values remain tabular. |
| CopyButton | Copy action | Default / focus / copying / copied / failed. Report copied only after clipboard success; copying setup guidance is not setup completion. |
| RevealField | Masked → confirm → revealed → auto-hide | Support cancel / failed reveal / hidden completion. Never write the raw key to `title`; keep disclosure limited to the intended field. Confirmation mechanics and auto-hide duration remain Open Questions. |

| Open Questions | Unspecified contract |
|---|---|
| Button treatments | Exact secondary, ghost, danger, disabled, and loading mappings are not supplied. Preserve one interactive accent; do not invent a second CTA color or new tints. |
| Error classes | Per-class semantic-color assignments, recovery actions, and retry contracts are not supplied. |
| Interaction details | Field/Select variants, modal/drawer keyboard behavior, toast lifetime, skeleton treatment, and reveal timing require definition or source verification. |

## 11. State matrix

| State | Rule |
|---|---|
| Empty | Show only after a successful read confirms no applicable records; distinguish no records from no filter matches. **A failed read must never render as an empty state.** |
| Loading | Identify the pending read or operation; do not substitute zeros, absence, or a service verdict. Distinguish retained data from a completed refresh. |
| Error | Name the failed operation and preserve available evidence and entered work. Show recovery without claiming an unverified cause. |
| Success | **A mutation must never report success before its response is checked.** Distinguish accepted persistence from local UI changes and verify the saved result where required. |
| Offline | Identify unavailable connectivity or service evidence explicitly; do not infer missing configuration, missing installation, or invalid credentials. |
| Partial | Identify available and unavailable portions separately; do not present incomplete totals or derived values as complete measurements. |

### Per-surface exceptions

| Surface | Required distinction / exception |
|---|---|
| CLI Tools | Catalog count is not installed count. Failed detection is not absence; copied guidance is not completed setup. Wizard detection and generated-command completion checks remain to be established. |
| Free lane / Proxy Pools | “Saved” requires checked PATCH success. Exhausted bound pools fail loudly with pool and attempted members named; never direct fallback. Free-lane integration remains unverified. |
| Token Saver | Check setting mutations before claiming persistence. Savings evidence must distinguish unavailable measurements from zero savings. |
| Headroom | Distinguish absent / running / unhealthy / check failed. A failed status call is not “not installed”; a running service must not retain a static setup prompt. |
| Console Log | Distinguish live / paused / failed / empty. Bound the paused buffer; check DELETE before reporting clear success. Log silence is not service-health evidence. |
| Usage | Evaluate Trend against the selected metric; do not render all-zero Trend or Breakdown as authoritative. Identify token-apportioned costs as derived, not measured provider charges. |
| Quota Tracker | Failed connection reads are not zero connections or “No Providers Connected.” Replace emoji status signals with labeled ledger states. |
| Providers | Failed connection reads require error/retry, not an empty list. Bulk-toggle failure must not leave a false persisted state; clear-filter recovery includes search. |
| Endpoint & Key | Failed key reads must not trigger first-time default-key creation. Static “Local mode” and “Reachable” claims are not reachability checks; raw-key tooltip exposure goes to the security gate. |
| Playground | Failed provider reads are errors, not “No providers connected yet.” |
| Combos | Failed initial reads must not also claim “No combos yet.” Check strategy/capacity saves; member rename preserves order and the existing string-array schema. |
| OpenCode models | Distinguish selectable models from stored unavailable IDs; registry absence alone is not retirement evidence. Check model-save responses. |
| Remaining surfaces | Apply the shared matrix to Translator, Media, Skills, and Settings; full rendered state, keyboard, responsive, and contrast coverage remains unverified. |

## 12. Responsive

Breakpoints ship as Tailwind v4 defaults: no `tailwind.config.*` or `@theme inline` breakpoint overrides exist. Responsive behavior below is a contract unless explicitly identified as shipped.

| Token | rem | px | What changes there |
|---|---|---|---|
| `sm` | 40rem | 640px | Shipped page padding changes from mobile `1rem` to tablet `1.5rem`; `globals.css` mobile query ends at `639px`. |
| `md` | 48rem | 768px | Shipped utility breakpoint; no specific surface transition established by the supplied evidence. |
| `lg` | 64rem | 1024px | Shipped page padding changes to desktop `2rem`; tablet query ends at `1023px`. |
| `xl` | 80rem | 1280px | Shipped utility breakpoint; content remains bounded by the shipped `90rem` maximum. |
| `2xl` | 96rem | 1536px | Shipped utility breakpoint; additional viewport width does not remove the content maximum. |

| Element | Responsive contract |
|---|---|
| Rail | Collapse to icons when space is constrained; retain accessible navigation names. Zone groups ship collapsed by default; this does not establish the rail's responsive collapse threshold. |
| Tables | Use stacked rows when columns cannot remain legible; preserve field labels, record identity, comparable values, and row actions. |
| Wide data tables | Horizontal scrolling is acceptable only when the first column is pinned. Do not use horizontal scrolling as the page layout. |
| Primary actions | Never hide or remove access to the primary action to make a layout fit; reflow it. |
| Status labels / error text | Never collapse into color-only signals or conceal meaning to save width; allow wrapping. |
| Touch targets | Maintain at least `2.75rem`, including controls inside compact rows; control height alone does not establish target compliance. |
| Open Questions | Exact rail-collapse and table-stacking thresholds, pinned-column implementation, and per-surface responsive behavior require source or rendered verification. |

## 13. Accessibility floor

### Computed contrast

Ratios use the supplied solid foreground and background colors; they do not establish rendered compliance.

| Foreground | Canvas `#0B0D0C` | Rail `#070908` | Surface `#111411` | Raised `#171B17` | Strong `#1E241D` |
|---|---|---|---|---|---|
| Text `#F7F8F4` | 18.28 | 18.72 | 17.39 | 16.33 | 14.86 |
| Muted `#AFBAAB` | 9.69 | 9.92 | 9.22 | 8.66 | 7.87 |
| Subtle `#879483` | 6.12 | 6.27 | 5.83 | 5.47 | 4.98 |

| Foreground | Background | Contrast |
|---|---|---|
| On-primary `#0B0D0C` | Primary `#8FCBF7` | 11.19 |

### Interaction contracts

| Area | Accessibility floor / verification boundary |
|---|---|
| Focus | Use the shipped `3px` `--color-primary-border` ring, never an outline swap. Keep focus visible and unobscured, including within scroll containers. |
| Keyboard | All actions must be keyboard-operable, with logical focus order and no unintended traps. Icon-only rail controls retain accessible names. |
| Modal / drawer | Verify focus entry, containment where modal, dismissal, and restoration to the invoking control; these are requirements, not audited compliance claims. |
| ARIA / semantics | Use semantic controls and accessible names; expose expanded, selected, checked, disabled, and busy states as applicable. Associate fields with labels and errors. |
| Feedback | Make pending, success, and error feedback available to assistive technology without requiring color perception or moving focus unnecessarily. |
| Status / data | Preserve explicit state labels and table relationships, including stacked presentations. Color and wash reinforce meaning, never replace it. |
| Targets | Enforce the `2.75rem` touch minimum. Audited quota and Translator controls below that floor require correction. |
| Reduced motion — shipped | Globally enforced in `src/app/globals.css:169`, `src/app/globals.css:287`, and `src/app/globals.css:367`: animations and transitions are disabled with `!important`; scroll behavior becomes `auto` with `!important`. |
| Reduced motion — verification | Per-surface behavior under suppression remains unverified; confirm state changes and operation feedback remain perceivable without transitions or animation. |
| Audit boundary | Findings are source-derived. Rendered behavior, rendered contrast, keyboard/focus behavior, assistive-technology output, and per-surface responsive coverage remain unverified. |

## 14. Out of Scope for 3.3.0

| Exclusion | Boundary |
|---|---|
| Brand replacement | No new palette, typography, or re-skin; do not restore the obsolete 1.1.0 operations-console identity. |
| Obsolete scope promotion | Do not implement old `DESIGN.md` wholesale; corrected scope is audit, eight items, refreshed brief, and full-surface polish. |
| First-run onboarding wizard | Not scheduled; distinct from the in-scope CLI Tools setup wizard. |
| Virtualized lists | Virtualized 50+ row lists are not scheduled. |
| Fork feature backlog | `docs/FEATURES.md` items from forks are not scheduled. |
| CLI version change | `cli/` stays `1.0.0`; the application release moves to `3.3.0` at release time. |
| Combo schema migration | No display-label migration or schema change; member rename retains the existing string-array representation. |

## 15. Open Questions

- What are the shipped numeric breakpoints, navigation collapse rules, and narrow-screen table overflow priorities?
- What are the unresolved component treatments, keyboard contracts, feedback lifetimes, and reveal timing identified in §10?
- Do resolved semantic washes and the focus ring meet contrast requirements on every actual background?
- Does the no-auth pool binding reach the OpenCode free lane specifically?
- What is the complete tool-card inventory, and where do OpenCode free models appear across pickers?
- What evidence establishes model retirement and validates CLI detection, generated-command execution, and setup completion?
- What resource limits and health acceptance checks gate Headroom deployment on papi?
- Does the full rendered pass confirm responsive behavior, reduced-motion handling, keyboard order, and assistive-technology semantics across every surface?
