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
- Hotfix image: _pending_
- papi digest: _pending_
