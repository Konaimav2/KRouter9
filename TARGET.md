# TARGET.md — what ships, concretely

Item codes U1–U21 = the user's 21 findings; OC1 = the wanted OmniRoute cache feature.
`docs/FEATURES.md` already documents what each fork gave us — TARGET lists what is
still missing or broken.

## P0 — ship first, before anything else

- **P0a — combo hot-loop (the wedged gateway).** Code fix is on `main` (`208cd7ab`:
  `comboName` ReferenceError, self-member pre-filter bare + slash-tail, visited-chain
  503, throttled logs). Still to ship: rebuild image → swap papi `krouter9` (batched
  restart, approval-gated, never touch `cloudflared-9router`) → verify a cyclic combo
  returns `503 has no usable models` in ms, no log-spam. Done-criteria: papi serves
  the 503 on the previously-wedging request.
- **P0b — weird stops (sessions dying after tool-use/thinking).** The fix is process,
  now codified in `AGENTS.md` (Operating discipline + Planning protocol): mandatory
  TodoWrite, one `in_progress`, waves always close the loop, handover-before-stop,
  resume protocol. Done-criteria: the next full dispatch wave completes with every
  wave outcome recorded and zero unexplained stalls.

## Then: 1.0.1 correctness (publish after)

- U1/U2 — User-Agent is provider-level only; the 12 ex-per-key presets live in the
  provider editor; startup migration clears orphaned per-key values. No per-key UA
  field anywhere.
- U4 — Playground picker + chat work; `isOpenAICompatibleProvider`-class breakage
  covered by import-verifying tests.
- U6 — AgentRouter outbound requests carry the configured UA (match what opencode
  itself sends); verified against the live spec, not assumed.
- U7 — Docs button in the menu next to Change Log; Change Log fed by local file.
- U8 — Every half-implemented feature below is either finished or cut: no dead
  buttons, no placeholder pages. (Dead-link sweep is part of the gate.)
- U9 — Account disable toggle persists across re-imports; bulk disable confirms.
- U13 — oxlint clean on touched files (config `.oxlintrc.json`) alongside eslint.
- U17 — Three providers live from the collected papi specs: AgentRouter
  (`https://agentrouter.org/v1`, `agentr`), B.AI (`https://api.b.ai/v1`, `bai`),
  TokenHarbor (`https://tokenharbor.ai/v1`, `tkhb`).
- U21 — `flash`/`flash-qa` behavioral QA over all of the above.
- Publish: version bump, `CHANGELOG.md`, npm, Docker `:1.0.1` → `:latest`, git push.
  Pre-ship gate in `AGENTS.md` applies.

## Then: 1.1.0 features + overhaul

- U3/U12 — Dashboard overhaul per `DESIGN.md`: new teal-cyan world (the orange
  `#E56A4A` era ends), regrouped sidebar (Operate/Observe/System), flattened Media
  Providers, Remote Access/Donate out of the nav, topbar Docs + Changelog buttons.
- U10 — Combos redesigned: ordered members, per-member status, routing-mode control,
  dry-run test showing the tried-chain.
- U11 — Power parity with stock 9Router: audit every provider/quota/combo control in
  stock 9Router and list gaps; each gap is finished, cut with a reason, or moved to
  the fork-gap table — nothing silently missing.
- OC1 — OmniRoute-style exact-match response cache for providers without caching:
  per-provider toggle, TTL, hit counters, `/v1` + playground honored.
- U14/U16 — Subagent-driven execution per `AGENTS.md` planning protocol (`spark*`
  impl — never restarted mid-wave since they route through papi `krouter9` — plus
  `flash` QA); U15 depth-over-surface is enforced by the protocol, not asked twice.
- U18 — Fork-gap table: every feature in SRouter / OmniRoute / 9router-v3 / npm
  `allxd9router` marked ported / missing-with-reason / intentionally skipped.
  Source of truth lives in `docs/FEATURES.md`; TARGET tracks completion.
- U19/U20 — README lists the npm fork lineage and reads cleanly: install, 60-second
  start, where data lives, where docs live, fork credits. `i18n/` copies follow the
  English source after it settles.
- `flash` QA passes behaviorally over everything above, then publish `1.1.0`.
- Small fixes riding along: `npm run start` port hardcode (`--port 20127` vs 20128).

## Never

- Restart papi `krouter9` while agents route through it; batch restarts. `sol` is
  active again (unsuspended by the P0a ship) — re-suspend if loop symptoms return.
  No `terra-debug`. Subagents never commit/restart/publish. No real-test result
  ever faked green.
