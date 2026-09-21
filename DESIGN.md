# DESIGN.md — KRouter9 visual world: "operations console"

Mode: **Operate** (visitor completes tasks: route keys, inspect quota, debug combos).
Brand lives in precise details, not decoration. Dark-first, light supported. Every UI
claim needs behavioral proof (click/toggle/reveal works against the API), never
screenshots alone. Backend-only work stays in TARGET.md.

## 1. Anti-reference: what we are leaving (evidence, not taste)

- Current `src/app/globals.css` header says it plainly: **"9Router palette — adopted
  from 9remote_private/web. Brand orange / soft coral, `--color-brand-500: #E56A4A`"**.
  That hue is 9Router's identity and must go completely: tokens, shadows
  (`--shadow-warm`, `--shadow-focus`), update-badge greens notwithstanding.
- Current `Sidebar.js` nav order + icons (`chat/api/dns/layers/bar_chart/data_usage/
  savings/terminal`, System: `perm_media/lan/terminal/settings`) is item-for-item the
  upstream 9Router shell (verified against a live 9Router instance). Reordering alone
  is not enough — regroup and restyle (see §3).
- The three forks are **reference only, and mostly a warning**: SRouter, OmniRoute,
  9router-v3 all keep the 9Router shell. Borrow *features*, never the look:
  - OmniRoute: onboarding wizard (first-run), cost-analytics view, free-tiers page,
    provider-limits sync UI, CLI-tools setup page.
  - vibecoder11200-style in-sidebar update badge (already have it — keep, restyle).
  - `allxd9router` (npm-only, no source): nothing to borrow — see `docs/FEATURES.md`.
- Zero `decolua` in user-facing UI. Identity is `Konaimav2/KRouter9` everywhere.

## 2. Visual world

**"Operations console"**: dense, scannable, honest about state. Dark slate surfaces,
one signal hue, tabular numerals, status colors reserved for status.

- **Brand hue (mandated band): teal-cyan, never orange/coral.** Center light theme on
  `--color-brand-500: #0D9488` (teal-600), dark theme on `#2DD4BF` (teal-400) for
  contrast on dark surfaces. Full 50–900 scale derived from that center; rewrite the
  `globals.css` header comment to `KRouter9 operations-console palette`.
- **Surfaces**: light warm-neutral (keep current warm grays, they are fine); dark
  neutral slate `#111417` bg / `#1A1E23` surface (cooler than today's `#1a1a1a` so the
  themes feel designed, not inverted).
- **Status colors only for status**: success/warning/danger/info tokens exist already
  — rule: brand teal never doubles as success green; error badges use danger + icon.
- **Typography**: keep Fira Sans (UI) + Fira Code (endpoints, keys, logs, numbers with
  `font-variant-numeric: tabular-nums`). Base 16px, scale 12/13/14/16/20/24.
- **Icons**: Material Symbols already in use — keep, one style only (outlined,
  `fill-1` for active nav, nothing else filled). No emoji as icons, ever.
- **Motion**: 150–300ms ease-out enter, faster exit; press feedback (scale 0.97 or
  state layer) within 100ms; `prefers-reduced-motion` disables all non-essential
  animation. Toasts auto-dismiss 3–5s with `aria-live="polite"`.
- **Density**: 4/8pt spacing rhythm; sidebar `w-64` (down from `w-72`); content
  `max-w-7xl`; desktop tables keep sticky headers; lists with 50+ rows virtualize.

## 3. Layout: regroup the sidebar, fix the topbar

Replace the 9Router item list with three groups (order + grouping is part of the
redesign, not cosmetic):

- **Operate**: Playground, Endpoint & Key, Providers, Combos.
- **Observe**: Usage, Quota Tracker, Token Saver, Console Log, Translator (gated).
- **System**: Proxy Pools, Media Providers (flatten the accordion — one page with
  tabs per kind, not a nested tree), Skills, CLI Tools, Settings.
- Remote Access promo and Donate blocks leave the sidebar (move to Settings/About).
  Shutdown stays at the sidebar foot, visually separated (danger, confirm modal).
- **Topbar**: `ThemeToggle`, Docs button + Change Log button side by side (U7),
  environment chip (`Local Mode` / version). Docs opens the gitbook/docs index;
  Change Log modal is fed by local `CHANGELOG.md` via `GET /api/changelog`.
- **Logo**: `public/krouter9.png` + `.svg` are the only marks — sidebar, login,
  proxy hub header ("KRouter9 Proxy"), login page, README badges. No generic art.

## 4. Component contracts (must work, not just render)

- **Playground**: model picker from canonical `src/shared/utils/playgroundModels.js`
  (`alias/model`, re-rooted, deduped); skeleton option rows while loading; upstream
  401 = visible error state, never a dead picker. `isOpenAICompatibleProvider is not
  defined` class of bug (U4) must not recur — imports verified by test.
- **Provider form**: User-Agent is **provider-level only** (U1). One preset select
  with the full preset list (U2: the 12 ex-per-key presets live here now); applies to
  every key on the connection. No per-key UA field anywhere.
- **Key policy**: selects like combos — catalog multi-toggle (`ModelSelectModal`) +
  chip toggles + free-text manual entry.
- **Quota**: `fetchQuota` under 30s `AbortController`; loading / empty (`data_usage`
  absent) / depleted-banner states; depleted Cursor cards link `status.cursor.com`.
- **Proxy pools**: URLs never raw — `proxyUrlMasked` + blur + confirm-to-reveal in
  list, cards, edit modals (blank input keeps stored value). Add/edit/test/delete
  without exposing secrets.
- **Key reveal**: single-record confirm modal → `GET /api/providers/[id]/reveal?
  confirm=true` → copy + auto-hide; never in component state, never bulk.
- **Errors**: distinct `refresh-invalid` badge; sort/group on providers + quota over
  normalized classes (auth-invalid / refresh-invalid / ratelimited / network /
  unknown). Combo failures name every tried model (`tried: a [502 …] → b […]`),
  never `<none>`. Every error states cause + recovery (retry/edit/help).
- **Account toggle**: `isActive` persisted; disabled survives re-import until toggled
  back (U9); bulk disable behind a confirm modal.
- **Forms**: visible labels (never placeholder-only), inline validation on blur,
  error under the field, focus jumps to first invalid field on submit.

## 5. Page notes (what "redesigned" means per page)

- **Combos (U10)**: the page must teach the mental model — ordered member list with
  drag/keyboard reorder, per-member status dot (last probe result), routing-mode
  segmented control (fallback / round-robin / sticky), dry-run "test this combo"
  button showing the tried-chain. No silent semantics.
- **Providers**: health-at-a-glance row (status dot, error-class badge, quota mini),
  bulk actions bar, UA preset select inline in the provider editor.
- **Usage / Quota**: charts get legends, units on axes, tabular numbers, empty states
  with guidance ("No data yet — send a request through /v1"), CSV export where data
  is dense.
- **CLI Tools**: one-click setup cards per tool (borrow OmniRoute's page concept),
  copy-paste endpoint + key blocks.
- **Settings**: sections with sticky sub-nav; danger zone (shutdown, reset) isolated
  at the bottom.

## 6. Accessibility floor (non-negotiable, from ui-ux-pro-max)

Contrast 4.5:1 body / 3:1 large in **both** themes (verify dark independently);
44×44px touch targets; visible focus rings; keyboard-full flows (nav, modals, menus);
skip-to-content link; heading hierarchy unbroken; color never the only signal.

## 7. Out of scope

Backend semantics (fallback TTL, cache, registry, translators) live in TARGET.md.
No new palette without updating this file first. No screenshot-only QA.
