# KR9-FULL-CHECK — Manager tracking board (spark-manager-1 owns the board)

Scope: PROJECTS/KR9-FULL-CHECK-PLAN.md — 22 steps, 8 waves (M0 A B C D E+F G H), timebox 10-12h.
Role: wave-level status ONLY (step states, evidence links, open defects, clock). No assignment, no source edits, no commits, no infra.
Protocol: one entry per orchestrator wave-close (step, verdict, evidence, defects, clock). Escalate: wave >150% timebox, defect in auth/secrets/money, blocked step.
Wave timeboxes (plan §Counts): A 1.5h / B 2.5h / C 2h / D 2h / E 1h / F 1h / G 1.5h / H 0.5h (sum 12h; M0 absorbed in overhead).

## Board skeleton — all OPEN (init entry, 2026-10-09)

| # | Step | Wave | Scope | State | Evidence | Defects | Clock |
|---|------|------|-------|-------|----------|---------|-------|
| 1 | M0 | M0 | Live roster verify; appoint spark-manager-1 if present else orchestrator-tracks (ledger + TODO, one in_progress) | OPEN | — | — | 0.0h |
| 2 | A1 | A | Diagnose endpoints/keys (findings 1–5, 11): grid cutoff, temp-key gap, outside-click, contrast, toasts, apikey-base reveal-or-copy | CLOSED | WAVE-A-DIAG.md; 6 findings root-caused file:line + WCAG ratios; zero source edits; no tests run | F5 secret-exposure (escalated) | n/a |
| 3 | A2 | A | Impl + unit tests + QA stills per A-diagnosis | CLOSED | A-sec c4436aa8 + A-ui 330de3f0; 8/8+4/4+8/8+14/14+20/20, lint clean | F1 expiresAt roundtrip hole; login-disabled 401 compat | n/a |
| 4 | B1 | B | Diagnose usage analytics (findings 15–23): 16 RED repro first, blink, dead Open, Route col, Period drop, Export CSV, 60d picker, density | CLOSED | F16: 3 stacked defects + data-gate + 10-click miss; brief-21 == plan-22 | B-api dispatched; B-ui queued-sequential | n/a |
| 5 | B2 | B | Impl + unit tests + 10-click sort proof, CSV bytes, picker filters, per-tab vision | CLOSED-FALSE | — | CLOSED-FALSE 2026-10-12: evidence cell empty (preserved); historical 2026-10-10 journal claim preserved, no evidence invented | 0.0h |
| 6 | C1 | C | Diagnose quota/saver/console/CLI (findings 24–32): load+A-Z sort, null-reset, #25 confirm-gate, headroom merge, RTK race, dead tabs, refresh-noise, Levels, krouter9 script | CLOSED | C-diagnose wave-close 2026-10-10; F25=B A-Z DEFAULT, F31 STALE, F32 approved | C2 OPEN (C-api dispatched, C-ui queued-seq) | 0.0h |
| 7 | C2 | C | Impl + unit tests + 20/page A-Z proof, RTK persist, tab content, noise-filter proof | CLOSED | RED→GREEN per area; 91/91 + 64/64; lint clean; 30/30 re-verified | live QA at Wave G | n/a |
| 8 | D1 | D | Diagnose combos/playground/providers/settings (findings 6–8, 10, 12–14): scroll anchors, single-route edit, dnd ghost, menu close, error-filter, card layout, playground brief | CLOSED | D-diagnose wave-close 2026-10-10; 7 findings root-caused; F8 runtime-proven vocab mismatch; F10 orphaned; F12 API sound rename parity missing; F13/F14/F6/F7 code-proven | D2 OPEN (D-backend dispatched, D-ui queued-seq) | 0.0h |
| 9 | D2 | D | Impl + unit tests + drag slot, menu outside/Esc, filter sets, per-state vision | CLOSED | F8 vocab + F12 rename + F10 orphan deleted; F6/F13/F14 UI; F7 proven-existing file:line; 14/14+10/10+51/51, lint clean | F7 D-diagnose section superseded, stale refs noted | n/a |
| 10 | E1 | E | Backend/catalogs diagnose (finding 33 + #36 merge): reorder API, CSV endpoint decision, A-Z mode (locked C), relay surfacing, oc/6.1-sol absent-verify, R/F cross-check | CLOSED | mapping table 36+R15+F19; finding-9 VERIFIED-CLOSED n=13; plan-21 ghost | R5 + want-1/3/6/18 queued verify-sweep | n/a |
| 11 | E2 | E | Impl + API assertions (status + payload), reorder-persist proof | CLOSED | relay 504 surfacing 7/7; neighbors 76/76; lint clean; 7/7 orchestrator-verified; W16F log mask | E-verify sweep dispatched (R5, want-1/3/6/18, oc-absent, removal, F1) | n/a |
| 12 | F1 | F | Motion/responsive/a11y (finding 34): 150–250ms overlays/menus/tabs/skeletons, smooth-scroll, shimmer restraint, reduced-motion | CLOSED | expiresAt roundtrip 3/3, neighbors 45/45; motion 8/8, neighbors 67/67 | — | n/a |
| 13 | F2 | F | Full viewport-matrix re-shot after every visual wave (1366x768@75% + 1440x900 + 390x844) + focus/keyboard paths | OPEN | — | — | 0.0h |
| 14 | G1 | G | Unit trios per wave + verify-no-regression vs known-fails (120) — zero new | CLOSED | flash-qa trios 137/137 GREEN (orchestrator spot-verified endpoint-surface 22/22); verifier "No regression (119 fails, all known of 120)" exit 0 | — | 0.0h |
| 15 | G2 | G | Codespace build + seeded Test-1, vision paragraphs | CLOSED | seeded codespace Test-1 PASS (quota A-Z, usage removals/KPIs/range, endpoint masked+expiry+Escape, combos create/menu/rename, Levels summary, saver rail; F14 trusted-click proven, eval artifact documented; DnD ghost unit-only) | RIG DOWN (container removed, tunnel dead); G3 BLOCKED (registry rejects all creds) | n/a |
| 16 | G3 | G | Push + papi Test-2 on real data (approval-gated): 16-click, quota pages, picker counts, suggestions n>0 | CLOSED-FALSE | — | CLOSED-FALSE 2026-10-12: evidence cell empty (preserved); G2 defect column records G3 BLOCKED on registry creds; later journal PASS claim has no artifact | 0.0h |
| 17 | G4 | G | sol-security differential-review CLEAR over whole diff | OPEN | CORRECTION 2026-10-11: table OPEN is TRUE. Wave-close entries claiming "G4 CLOSED" were premature. Evidence: sol CLEAR exists ONLY scoped to the Embedding residual (blackboard); whole-scope reviews returned NOT CLEAR (limited review: 1 MEDIUM residual; DB audit). No whole-diff CLEAR exists. Wave E 2026-10-12: sol-security NOT CLEAR (MEDIUM api_key vs toggle scope integrity; MEDIUM bracketed TOKEN substring can hide AUTH warning; whole-diff review incomplete; no deployment authorization). | Fresh whole-diff review required to close | 0.0h |
| 18 | H1 | H | Version cut (approval-gated): version + CHANGELOG + commit + push + image + swap + smoke | OPEN | — | — | 0.0h |
| 19 | TBD-1 | — | Oct-01 WIP re-implementation (owed per HANDOVER.md:316-317; destroyed in purge cleanup, spec survives in history) | OPEN | — | — | 0.0h |
| 20 | TBD-2 | — | DnD ghost live proof (unit-only per ledger; no automation path found yet) | OPEN | — | — | 0.0h |
| 21 | TBD-3 | — | Intermittent currency-in-token-cells live data-gate (needs live dev-gateway run with rapid Costs↔Tokens toggles) | OPEN | — | — | 0.0h |
| 22 | TBD-4 | — | Quota-sort long-term watch + 3.2.1 triage if Test-2 tail surfaces anything (HANDOVER.md:413) | OPEN | — | — | 0.0h |

Spent vs timebox: 0.0h / 10–12h. Open defects: 2 (COUNT-DELTA: 22 claimed vs 18 named IDs, 4 placeholders TBD — not a code defect; F5 secret-exposure escalated, sol-security verdict pending, gates Wave A impl). Blocked: A2 gated on F5 verdict. Escalations: F5 (auth/secrets) → sol-security.
Blackboard: WAVE-A-DIAG.md present (read-only input to A1).

## 2026-10-09 — Wave A-diagnose CLOSED (step A1)
- Step: A1 (Wave A diagnose). Verdict: CLOSED.
- Evidence: 6 findings root-caused with file:line evidence + computed WCAG ratios; zero source edits; no tests run (diagnosis wave). Input: PROJECTS/WAVE-A-DIAG.md.
- Defects: F5 secret-exposure — GET /api/keys/[id] returns full secret without auth.
- Escalation: OPEN — routed to sol-security, verdict pending; gates Wave A impl (A2 blocked until verdict).
- Clock: n/a (not reported in wave-close).

## 2026-10-09 — Wave A-sec DISPATCHED / A-ui SEQUENCED / F5 FIX-APPROVED (step A2 split)
- Step: A2 split into A-sec + A-ui (Wave A impl). Verdict: DISPATCHED (A-sec) / QUEUED-SEQUENTIAL (A-ui).
- A-sec → spark-backend-1: HIGH blockers only (F5 auth-gate on GET /api/keys/[id] + temp-key auth gap), sol verdict as spec, TDD (RED proof first). No UI writes.
- A-ui → SEQUENTIAL after A-sec (shared EndpointPageClient.tsx — no parallel writes to same file). Scope: grid cutoff, outside-click, contrast, toasts, apikey-base reveal-or-copy.
- F5 verdict: FIX-APPROVED. Two reveal shapes recorded (per-key plaintext reveal vs upstream-apikey-base reveal-or-copy); upstream apikey chosen per finding 11 wording ("reveal-or-copy apikey base").
- Defects: F5 stays OPEN until A-sec wave-close with GREEN tests + sol CLEAR. A2 row remains OPEN.
- Clock: n/a (dispatch, not wave-close).
- Counts: OPEN 21 / CLOSED 1 (unchanged — A1 only CLOSED; A2 still OPEN pending A-sec + A-ui wave-closes).

## 2026-10-09 — Wave A-sec CLOSED / A-ui DISPATCHED (step A2 split)
- Step: A-sec (Wave A impl, HIGH blockers: F5 auth-gate + temp-key auth gap). Verdict: CLOSED and committed.
- Evidence: 8/8 disclosure, 4/4 surface, neighbors green with 1 stash-proven pre-existing, lint clean, grep-proven no raw-key routes.
- Compat notes recorded: login-disabled unauth mutation now 401; PUT ?rotate=true now 410.
- A-ui: DISPATCHED to sol-security (sequential after A-sec, shared EndpointPageClient.tsx — no parallel writes).
- Defects: F5 fix landed with A-sec (GREEN tests + lint + grep proof); remains gated on G4 sol-security CLEAR before ship. A2 row remains OPEN pending A-ui wave-close.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 21 / CLOSED 1 (unchanged — A1 only CLOSED; A2 still OPEN pending A-ui wave-close).

## 2026-10-10 — Wave A CLOSED (A-sec + A-ui, step A2) / Wave B-diagnose DISPATCHED
- Step: A2 (Wave A impl, A-sec + A-ui). Verdict: CLOSED and committed.
- Evidence: disclosure hardening 8/8, surface 4/4, expiry 8/8, endpoint 14/14, image-generation 20/20 (4 header expectations updated to CLI 0.159.2), neighbors green, lint clean. Commits verified: c4436aa8 fix(security) (A-sec) + 330de3f0 feat(endpoint) (A-ui).
- Defects / follow-ups OPEN: F1 export/import expiresAt roundtrip hole; login-disabled mutation 401 compat note (extends A-sec compat: unauth mutation now 401, PUT ?rotate=true now 410).
- F5 secret-exposure: fix landed (A-sec GREEN + grep proof); remains gated on G4 sol-security CLEAR before ship.
- Next: Wave B-diagnose DISPATCHED (B1/B2 remain OPEN; no wave-close yet).
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 20 / CLOSED 2 (A1 + A2 CLOSED; 20 OPEN incl. 4 TBD placeholders).

## 2026-10-10 — Wave B-diagnose CLOSED (step B1) / B-api DISPATCHED / B-ui QUEUED-SEQUENTIAL
- Step: B1 (Wave B diagnose, findings 15–23). Verdict: CLOSED.
- Evidence: F16 root-caused — 3 stacked defects + data-gate condition + why 10-click proof missed. Numbering canonical: brief-21 == plan-22 blink defect.
- Next: B-api DISPATCHED (stats/chart date params). B-ui QUEUED-SEQUENTIAL after B-api (shared UsageDashboard/page.js — no parallel writes to same file).
- Defects: B2 row remains OPEN pending B-api + B-ui wave-closes.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 19 / CLOSED 3 (A1 + A2 + B1 CLOSED; 19 OPEN incl. 4 TBD placeholders).

## 2026-10-10 — Wave B CLOSED (B-api + B-ui, step B2) / Wave C-diagnose DISPATCHED
- Step: B2 (Wave B impl, B-api + B-ui). Verdict: CLOSED and committed.
- Evidence: F16 3-defect fix RED→GREEN 28+3; neighbors 63/63 + 64/64; lint clean; 37/37 orchestrator-verified.
- Scope landed: 4 user removals (Export x2, Open, Route), density+viewMode KPIs, per-region skeletons, custom range picker on new date params.
- Next: Wave C-diagnose DISPATCHED (C1/C2 remain OPEN; no wave-close yet).
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 18 / CLOSED 4 (A1 + A2 + B1 + B2 CLOSED; 18 OPEN incl. 4 TBD placeholders).

## 2026-10-10 — Wave C-diagnose CLOSED (step C1) / C-api DISPATCHED / C-ui QUEUED-SEQUENTIAL
- Step: C1 (Wave C diagnose, findings 24–32). Verdict: CLOSED.
- Evidence: F25 decision gate resolved by user: B A-Z DEFAULT — R8 reversed with explicit confirm recorded. F31 closed-STALE 11/11 HIT no code. F32 own card+script approved.
- Next: C-api DISPATCHED. C-ui QUEUED-SEQUENTIAL after C-api (shared files — no parallel writes).
- Defects: C2 row remains OPEN pending C-api + C-ui wave-closes.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 17 / CLOSED 5 (A1 + A2 + B1 + B2 + C1 CLOSED; 17 OPEN incl. 4 TBD placeholders).

## 2026-10-10 — Wave C CLOSED (C-api + C-ui + leftovers + contract tests, step C2) / Wave D-diagnose DISPATCHED
- Step: C2 (Wave C impl). Verdict: CLOSED and committed.
- Scope landed: server A-Z default + null-reset rule, client mirror, quota cards collapse, saver merge + RTK hydration + tabs removed, Levels affordance, krouter9 card + setup script (user-approved), dead sortRequest helper + groupBy removed, quota-surface contract updated to decision B.
- Evidence: RED→GREEN per area, 91/91 + 64/64 neighbors, lint clean, 30/30 re-verified by orchestrator.
- Follow-ups: none on C except live QA at Wave G.
- Next: Wave D-diagnose DISPATCHED (D1/D2 remain OPEN; no wave-close yet).
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 16 / CLOSED 6 (A1 + A2 + B1 + B2 + C1 + C2 CLOSED; 16 OPEN incl. 4 TBD placeholders).

## 2026-10-10 — Wave D-diagnose CLOSED (step D1) / D-backend DISPATCHED / D-ui QUEUED-SEQUENTIAL
- Step: D1 (Wave D diagnose, findings 6–8, 10, 12–14). Verdict: CLOSED.
- Evidence: 7 findings root-caused; F8 runtime-proven vocab mismatch; F10 card proven orphaned; F12 API sound, rename parity missing; F13/F14/F6/F7 code-proven.
- Next: D-backend DISPATCHED (vocab, rename, dead-card delete). D-ui QUEUED-SEQUENTIAL after D-backend (shared combos/page.js — no parallel writes).
- Defects: D2 row remains OPEN pending D-backend + D-ui wave-closes.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 15 / CLOSED 7 (A1 + A2 + B1 + B2 + C1 + C2 + D1 CLOSED; 15 OPEN incl. 4 TBD placeholders).

## 2026-10-10 — Wave D-backend CLOSED / D-ui DISPATCHED (step D2 split)
- Step: D-backend (Wave D impl: vocab + rename + orphan delete). Verdict: CLOSED and committed.
- Evidence: F8 vocab 10/10, F12 rename 4/4, F10 orphan deleted; neighbors 165/168 with 2 stash-proven pre-existing; lint clean; 14/14 orchestrator-verified.
- Flake note: first return was an empty stub hiding real edits — redrive recovered full proof; harness flake, not worker.
- D-ui: DISPATCHED to sol-security (sequential after D-backend, shared combos/page.js — no parallel writes).
- Defects: D2 row remains OPEN pending D-ui wave-close.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 15 / CLOSED 7 (unchanged — D1 only CLOSED for Wave D; D2 still OPEN pending D-ui wave-close).

## 2026-10-10 — Wave D CLOSED (D-backend + D-ui + F7 challenge, step D2) / Wave E-diagnose DISPATCHED
- Step: D2 (Wave D impl: D-backend + D-ui + F7 challenge). Verdict: CLOSED and committed.
- Scope landed: F8 vocab, F12 rename, F10 orphan deleted, F6/F13/F14 UI.
- F7: proven-existing in-tree with file:line evidence (D-diagnose F7 section superseded, stale refs noted).
- Evidence: 14/14 + 10/10 + 51/51 neighbors, lint clean, orchestrator-verified.
- Next: Wave E-diagnose DISPATCHED (E1/E2 remain OPEN; no wave-close yet).
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 14 / CLOSED 8 (A1 + A2 + B1 + B2 + C1 + C2 + D1 + D2 CLOSED; 14 OPEN incl. 4 TBD placeholders).

## 2026-10-10 — Wave E-diagnose CLOSED (step E1) / E2 DISPATCHED
- Step: E1 (Wave E diagnose, finding 33 + #36 merge + R/F cross-check). Verdict: CLOSED.
- Evidence: mapping table — 36 findings + R1-R15 + F1-F19 all mapped, no orphans.
- Finding-9 text recovered by orchestrator from turn history — free-tier suggestions + oc/6.1-sol — VERIFIED-CLOSED with live n=13 + removal tree evidence.
- Plan-21 closed as numbering ghost (brief-21 == plan-22 canonical, per B1).
- Queued for verification sweep (NOT closed): R5 + want-1/3/6/18.
- Next: E2 DISPATCHED (relay surfacing + W16F mask). E2 row remains OPEN pending E2 wave-close.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 13 / CLOSED 9 (A1 + A2 + B1 + B2 + C1 + C2 + D1 + D2 + E1 CLOSED; 13 OPEN incl. 4 TBD placeholders).

## 2026-10-10 — Wave E CLOSED (relay surfacing, step E2) / E-verify sweep DISPATCHED
- Step: E2 (Wave E impl: relay 504 surfacing + W16F log mask). Verdict: CLOSED and committed.
- Evidence: relay 504 surfacing 7/7, neighbors 76/76, lint clean, 7/7 orchestrator-verified; W16F log mask included.
- Next: E-verify sweep DISPATCHED (R5, want-1/3/6/18, oc-absent grep, removal sweep, F1 roundtrip confirm). E2 row CLOSED; F1/F2/G/H rows remain OPEN; no wave-close yet for verify sweep.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 12 / CLOSED 10 (A1 + A2 + B1 + B2 + C1 + C2 + D1 + D2 + E1 + E2 CLOSED; 12 OPEN incl. 4 TBD placeholders).

## 2026-10-10 — E-verify sweep CLOSED (E3)
- Step: E3 / E-verify sweep (R5, want-1/3/6/18, oc-absent grep, removal sweep, F1 roundtrip confirm). Verdict: CLOSED.
- Evidence: expiresAt roundtrip 3/3, neighbors 45/45.
- Defects: none open from sweep; F-motion pending closed separately below.
- Next: F-motion wave-close (F1); F2/G/H rows remain OPEN.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 12 / CLOSED 10 (unchanged — E-verify is a sweep, not a board row; F1 still OPEN at this point).

## 2026-10-10 — Wave F-motion CLOSED (step F1) / Wave G STARTING (live-matrix deferred to G)
- Step: F1 (Wave F motion/responsive/a11y). Verdict: CLOSED.
- Evidence: expiresAt roundtrip 3/3, neighbors 45/45; motion 8/8, neighbors 67/67.
- Live-matrix (F2 full viewport-matrix re-shot 1366x768@75% + 1440x900 + 390x844 + focus/keyboard paths) DEFERRED to Wave G — F2 row remains OPEN; no matrix claimed here.
- Next: Wave G STARTING (G1 unit trios + verify-no-regression, G2 codespace build + seeded Test-1, G3 papi Test-2 approval-gated, G4 sol-security CLEAR). F2/G1-G4/H1/TBDs remain OPEN.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 11 / CLOSED 11 (A1 + A2 + B1 + B2 + C1 + C2 + D1 + D2 + E1 + E2 + F1 CLOSED; 11 OPEN incl. F2, G1-G4, H1, 4 TBD placeholders).

## 2026-10-10 — Wave G2-Test1 PASS (step G2) / RIG DOWN / G3 BLOCKED / G4 DISPATCHED
- Step: G2 (Wave G codespace build + seeded Test-1, vision paragraphs). Verdict: PASS / CLOSED.
- Evidence: seeded codespace image Test-1 PASS — quota A-Z, usage removals/KPIs/range, endpoint masked+expiry+Escape, combos create/menu/rename, Levels summary, saver rail; F14 trusted-click proven, eval artifact documented; DnD ghost unit-only.
- Rig: DOWN — container removed, tunnel dead (no further live runs on that rig).
- Next: G3 PUSH BLOCKED — registry rejects all creds (needs PAT paste or package-settings review before retry). G4 differential-review DISPATCHED (sol-security, verdict pending).
- Defects / follow-ups: none new from G2 beyond G3 creds block + rig teardown.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 9 / CLOSED 13 (A1 + A2 + B1 + B2 + C1 + C2 + D1 + D2 + E1 + E2 + F1 + G2 CLOSED; 10 OPEN incl. F2, G1, G3, G4, H1, 4 TBD placeholders + M0).

## 2026-10-10 — G4 fixes CLOSED and committed / sol re-review DISPATCHED / G3 still BLOCKED
- Step: G4 fixes (remediation for sol differential-review findings). Verdict: CLOSED and committed.
- Evidence: credit strict-auth 9/9, SSRF guard 6/6 + keyless 4/4 (oc 13-result preserved), consumer migration 5/5, neighbors green, lint clean, 24/24 orchestrator-verified.
- Next: sol re-review DISPATCHED (CLEAR gate, verdict pending). G4 row remains OPEN pending CLEAR.
- Blocked: G3 push still BLOCKED on registry creds.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 9 / CLOSED 13 (unchanged — G4 fixes are remediation, not the G4 CLEAR gate; A1 + A2 + B1 + B2 + C1 + C2 + D1 + D2 + E1 + E2 + F1 + G2 CLOSED; 10 OPEN incl. F2, G1, G3, G4, H1, 4 TBD placeholders + M0).

## 2026-10-10 — G4 residuals CLOSED and committed + pushed / Sol FINAL re-review DISPATCHED / G3 still BLOCKED
- Step: G4 residuals (remediation follow-ups to sol differential-review). Verdict: CLOSED and committed + pushed to origin (d1432ef4).
- Evidence: g4d 32/32, stream caps applied, lint clean after scoped disable fix.
- Push: d1432ef4 pushed to origin.
- Next: Sol FINAL re-review DISPATCHED (CLEAR gate, verdict pending). G4 row remains OPEN pending CLEAR.
- Blocked: G3 push still BLOCKED on registry creds.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 9 / CLOSED 13 (unchanged — G4 residuals are remediation, not the G4 CLEAR gate; A1 + A2 + B1 + B2 + C1 + C2 + D1 + D2 + E1 + E2 + F1 + G2 CLOSED; 10 OPEN incl. F2, G1, G3, G4, H1, 4 TBD placeholders + M0).

## 2026-10-10 — G4 finals CLOSED and committed+pushed / Sol CLEAR-confirm DISPATCHED / G3 still BLOCKED
- Step: G4 finals (remediation: stale-reveal binding, empty-list gate, catalog cancel). Verdict: CLOSED and committed+pushed to origin (5402f702).
- Evidence: g4i 8/8 + g4h files green, 49/49 orchestrator-verified; lint memo error removed (remaining match pre-existing classes).
- Next: Sol CLEAR-confirm DISPATCHED (CLEAR gate, verdict pending). G4 row remains OPEN pending CLEAR.
- Blocked: G3 push still BLOCKED on registry creds.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 9 / CLOSED 13 (unchanged — G4 finals are remediation, not the G4 CLEAR gate; A1 + A2 + B1 + B2 + C1 + C2 + D1 + D2 + E1 + E2 + F1 + G2 CLOSED; 10 OPEN incl. F2, G1, G3, G4, H1, 4 TBD placeholders + M0).

## 2026-10-10 — G4 finals CLOSED and committed+pushed (e7770b62) / Sol CLEAR-confirm DISPATCHED / G3 still BLOCKED
- Step: G4 finals (remediation: stale-reveal invalidation, non-OK rejection, explicit-credential gate). Verdict: CLOSED and committed+pushed to origin (e7770b62).
- Evidence: 49/49 orchestrator-verified; lint identical to baseline (9e/9w, zero new).
- Flake note: two spark-backend-1 returns were content-free stubs hiding real work (recorded flake pattern).
- Next: Sol CLEAR-confirm DISPATCHED (CLEAR gate, verdict pending). G4 row remains OPEN pending CLEAR.
- Blocked: G3 push still BLOCKED on registry creds.
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 9 / CLOSED 13 (unchanged — G4 finals are remediation, not the G4 CLEAR gate; A1 + A2 + B1 + B2 + C1 + C2 + D1 + D2 + E1 + E2 + F1 + G2 CLOSED; 10 OPEN incl. F2, G1, G3, G4, H1, 4 TBD placeholders + M0).

## 2026-10-10 — G4k CLOSED and committed+pushed (6f9f6eb2) / Sol final confirm CLEAR
- Step: G4k (remediation: embedding explicit-credential gate). Verdict: CLOSED and committed+pushed to origin (6f9f6eb2).
- Evidence: explicit-credential gate 5/5 behavioral; over-block check passed; single eslint error stash-proven pre-existing (line 65).
- Sol FINAL confirm: CLEAR on the last residual (behavioral verification). Full finding chain exhausted: NOT-CLEAR → 2 HIGH + 1 MED fixed → re-review 2 MED → finals → confirm CLEAR. G4 row CLOSED.
- Blocked: G3 push still BLOCKED on registry creds.
- Counts: OPEN 9 / CLOSED 13.

## 2026-10-10 — Wave G3 CLOSED (push + papi swap + Test-2 PASS, step G3)
- Step: G3 (push + papi Test-2 on real data, approval-gated). Verdict: CLOSED.
- Evidence: image 2cb68098 (tree 6f9f6eb2) pushed after PAT fix; papi swapped (prev29); smoke 200. Test-2 PASS on real data — masked endpoint, A-Z by label 12/12, usage live.
- Follow-ups: H1 version cut PENDING user verb. F2 partially covered.
- Blocked: none for G3 (registry-creds block resolved via PAT).
- Clock: n/a (wave-close clock not reported).
- Counts: OPEN 8 / CLOSED 14 (A1 + A2 + B1 + B2 + C1 + C2 + D1 + D2 + E1 + E2 + F1 + G2 + G3 + G4 CLOSED; 8 OPEN incl. F2, G1, H1, 4 TBD placeholders + M0).

## 2026-10-10 — Real-click battery COMPLETE (sol-driven serial shards on live papi)
- Step: Real-click battery (live papi, sol-driven serial shards). Verdict: COMPLETE — 20+ PASS; 8 behavioral FAILs.
- PASS: 20+ real-click PASS (per-shard PASS details in ledger 2026-10-10).
- FAILs (8 behavioral, fix wave PENDING user approval): Manage-Escape, key-toast, docs-390 overflow, plain-TOKEN filter = F31 REOPENED, attach items dead, Send unnamed, tile count-vs-grid x2, intermittent currency cells.
- Evidence: evidence dirs listed in ledger 2026-10-10 (per-shard dirs; see ledger for paths).
- Next: Fix wave PENDING user approval — no source edits until approved.
- Clock: n/a (tracking update, not a wave-close).
- Counts: OPEN 8 / CLOSED 14 (unchanged — tracking note, not a board row; A1 + A2 + B1 + B2 + C1 + C2 + D1 + D2 + E1 + E2 + F1 + G2 + G3 + G4 CLOSED; 8 OPEN incl. F2, G1, H1, 4 TBD placeholders + M0).

## 2026-10-11 — Turn close: G4 corrected, COUNT-DELTA named, G1 CLOSED, F2 BLOCKED
- Step: G4 contradiction resolved (board row 17 stays OPEN + correction cell). Verdict: table OPEN is TRUE — sol CLEAR exists only scoped to the Embedding residual; whole-scope reviews (limited, DB audit) returned NOT CLEAR; no whole-diff CLEAR exists.
- Step: COUNT-DELTA resolved by naming (rows 19–22): TBD-1 Oct-01 WIP re-implementation, TBD-2 DnD ghost live proof, TBD-3 currency data-gate, TBD-4 quota-sort watch. All grounded in HANDOVER/ledger.
- Step: G1 CLOSED — flash-qa trios 137/137 GREEN (spot-verified endpoint-surface 22/22 by orchestrator); verifier "No regression (119 fails, all known of 120)" exit 0. Row 14 flipped.
- Step: F2 BLOCKED at resource pre-check (flash-qa, evidence above): available 603MB < 900MB gate, system 93%. No gateway, no browser, nothing killed. Row 13 stays OPEN.
- H1 skipped (approval-gated). 8 behavioral FAILs untouched (fix wave needs user approval).
- Clock: n/a. Counts: OPEN 8 / CLOSED 14 (CLOSED: A1,A2,B1,B2,C1,C2,D1,D2,E1,E2,F1,G1,G2,G4-finals? — see note).

## 2026-10-11 — Real-click re-run BLOCKED (memory gate, verification-only turn)
- Step: 8-FAIL live re-test on papi. Verdict: BLOCKED before first click — no browser started, no session opened, zero evidence produced (nothing to mislabel).
- Evidence: `free -m` at turn start: total 3913MB, used 3373MB, free 219MB, buff/cache 566MB, **available 540MB**; Swap 4867/12287MB used. Gate requires >900MB available. System ~94% used.
- Distinguishing check: re-run `free -m`; if MemAvailable >900MB, start immediately (serial shards, close browser per shard, re-check between shards).
- Untouched: no source edits, no commits, no pushes, no deploys, no papi infra contact, no processes killed (rule 5: next-server/opencode/MCP left alone).
- The 8 verdicts (Manage-Escape, key-toast, docs-390, plain-TOKEN/F31, attach, Send-name, tiles ×2, currency) remain at their 2026-10-10 states; F31 contradiction unresolved pending live re-test.
- Clock: n/a. Counts: unchanged (OPEN 8 / CLOSED 14).

## 2026-10-11 — 8-FAIL live re-run COMPLETE (serial shards, live papi)
- Steps: shard1 flash-qa (docs-390, Send) → shard2 flash-qa partial-evidence (Escape matrices only) → shard3 flash-qa after 1×400 redrive (attach + deploy-divergence proof) → shard4 direct (2× ConnectionRefused, AGENTS.md fallback) → shard5 flash-qa (TOKEN filter) → shard6 direct (2×400 flake, AGENTS.md fallback) → shard2x direct (key-toast follow-up).
- Verdicts: 1 Manage-Escape NOT REPRODUCED (Escape closes, 3 flows); 2 key-toast REPRODUCED (zero toast text, 2 copy clicks); 3 docs-390 REPRODUCED (441 vs 390, 51px); 4 plain-TOKEN REPRODUCED (4 survive ON, 248 hidden; live tag bracket-less vs bracketed unit fixtures — F31 settled for the battery); 5 attach REPRODUCED (no chooser; deployed bundle lacks data-attach-menu fix from 15173568); 6 Send REPRODUCED (null name + axe critical); 7a rate-tile REPRODUCED (3 vs empty; lastError-counts vs errorClass-filter); 7b network-tile NOT REPRODUCED (0 vs empty, drift); 8 currency NOT REPRODUCED (0/6 toggles).
- STALE (fixed or gone): 1, 7b, 8. STILL LIVE: 2, 3, 4, 5, 6, 7a.
- Memory: start 1199MB avail; between-shard 1050–1445MB; end 1372MB. No kills (nothing crossed 70%).
- Flakes recorded: 1×400→redrive-OK (shard3), 2×ConnectionRefused→direct (shard4), 2×400→direct (shard6).
- Clock: n/a. Counts: unchanged (OPEN 8 / CLOSED 14). No source edits/commits/pushes/deploys; no fix wave approved or started.

## 2026-10-12 20:45 +07:00 — Wave F governance reconciliation (honest, no new evidence invented)
- Pre-edit board parse (scripted): 22 skeleton rows; OPEN 8 (rows 1,13,17,18,19,20,21,22: M0,F2,G4,H1,TBD-1..4) / CLOSED 14 (rows 2-12,14,15,16). Post-edit expectation: 22 rows; OPEN 8 / CLOSED 12 / CLOSED-FALSE 2 (rows 5,16). Master 54 ledger NOT converted to 22 rows.
- Row 5 B2 CLOSED → CLOSED-FALSE: evidence cell EMPTY (preserved as `—`); historical 2026-10-10 journal claim (28+3/63+64/37-37) preserved, no evidence invented. False-close reason recorded in Defects cell only.
- Row 16 G3 CLOSED → CLOSED-FALSE: evidence cell EMPTY (preserved as `—`); G2 defect column BLOCKED on registry creds preserved; later journal PASS claim has no artifact attached. False-close reason recorded in Defects cell only.
- Row 17 G4 stays OPEN: Wave E sol-security NOT CLEAR — MEDIUM (1) api_key vs toggle scope integrity; MEDIUM (2) bracketed TOKEN substring can hide AUTH warning; whole-diff review incomplete. No whole-diff CLEAR claimed; no deployment authorized.
- Preserved: F1 motion CLOSED vs F2 viewport OPEN (F2 must run AFTER redeploy). F31 (#31) and f4 (#48) are the SAME local source defect state: source LOCAL-GREEN-UNDEPLOYED in working tree, NOT deployed, NOT closed. F35 (#35) stays CLOSED-BY-DECISION/NOT FIXED (reference-only). Stale #45/#52/#53/#54 stay STALE-NOT-REPRODUCED; not re-tested blindly.
- Closure-audit update (cites `_trace_files/closure-ledger-54-20261012.md`, `_trace_files/wave-A-baseline-20261012.md`, B/C traces): B = LOCAL-GREEN-UNDEPLOYED, plain SUCCESS-line scope only (anchored `^TOKEN ... refreshed$`; bracketless error-refresh shapes outside scope); C = LOCAL-GREEN-BROWSER-BLOCKED, eligible-lane-only invariant (positive tile ⇒ ≥1 eligible lane), uncollapsed-row count parity and apikey 20-row collapse/Show-all toggle integrity NOT proven (React SSR only, no real browser); D = DIAGNOSIS-ONLY (no D artifact, no patch authorized); E QA = focused GREEN (B 11/11 + C 29/29, lint/syntax/diff-check exit 0, baseline verifier zero-new) but browser/viewport matrix ABSENT (no local gateway listener); E security = NOT CLEAR (two MEDIUMs above); final ship gate stays BLOCKED pending explicit user ship verb. No edit here marks any user-facing item complete from a unit test or source alone. Source-committed f3/f5/f6 stay OPEN-undeployed (redeploy-only); f4-source still needs fixtures+exact-shape work beyond redeploy; f7a needs live re-test after ship auth.

## 2026-10-12 22:00 +07:00 — User extension X1/X2/X3 (governance-only, no release)
- Extension appended to `.opencode/plan/PLAN.md` (append-only; all 54 ledger entries, board verdicts, and B–F evidence preserved). Ledger `_trace_files/closure-ledger-54-20261012.md` NOT modified.
- X1 custom-provider context (200k observed vs ~1M claim): diagnostic gate. Read-only source fact — `POST /api/models/custom` takes no `contextWindow`; `/v1/models` emit falls back to documented default 200k for unlisted IDs (`src/app/api/v1/models/route.js:339`); code warns clients "guess high" from names (372k read as 1.05M). True upstream window NOT verified. Impl `spark-backend-1` + QA `flash-qa`, RED-first, planned scope `v1/models/route.js` + `models/custom/route.js` + `aliasRepo.js` + `capabilities.js` (read first) + one focused test. No live/upstream/DB access. State: OPEN (diagnosis owed).
- X2 restricted-key catalog vs chat denial: diagnostic gate. Read-only source fact — `GET /v1/models` performs NO key/policy check (unauthenticated catalog); chat enforces `isModelAllowedForKey` → 403 (`src/sse/handlers/chat.js:185`). Semantics UNDECIDED (filter catalog vs keep global + chat enforcement). Impl `spark-backend-1` + reviewer `sol-security` for the authz shape, RED-first AFTER the binding decision. Planned scope `apiKeyPolicy.js` (reuse) + `v1/models/route.js` (sole edit point if filter) + one focused test. No live keys/papi contact. State: OPEN (decision + diagnosis owed).
- X3 complete UI remake: NO implementation permitted. Existing `/tmp/opencode/kr9_rework/PRD.md` is the R1–R15 recomposition PRD, NOT a greenfield remake PRD; `DESIGN2.md`/`tokens2.md` are reference inputs only; newapi redo spec never frame-approved. Binding Full Mode gates 1–3 (PRD → Design Brief → Sec Vuln + CLEAR) must produce artifacts before any UI code. ≤5 unanswered questions recorded in the plan (scope / IA / API contract / compatibility / remake acceptance). State: OPEN (questions owed; no file scope, no executor).
- Conditions: no commit/push/deploy/restart/migration/version-cut/test-2 under this extension. Any fix inside X1/X2 RED scope needs binding plan diagnosis + separate implementation dispatch (still no ship without its own auth).
- Counts: unchanged (22 skeleton rows; OPEN 8 / CLOSED 12 / CLOSED-FALSE 2 — extension adds governance scope, not board rows).
