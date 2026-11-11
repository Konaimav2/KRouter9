#!/usr/bin/env node
// One-off scanner (wave G3): list every Tailwind utility under src/ whose value
// is a custom name that neither Tailwind's default theme nor the @theme block in
// src/app/globals.css declares, so Tailwind emits no CSS for it.
//
//   node tests/scripts/scan-unknown-tailwind-tokens.mjs            # token-based scan
//   node tests/scripts/scan-unknown-tailwind-tokens.mjs --tailwind # + cross-check with
//        Tailwind's own compiler (unstable API, dev-only): every class token found in
//        class strings is compiled and the ones producing no CSS are listed too.
//
// Exit code 1 when anything unknown is found. Read-only; no build.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { loadTheme, repoRoot, scanRepo } from "../helpers/tailwindTokenScan.mjs";

const hits = scanRepo();
const byToken = new Map();
for (const h of hits) {
  if (!byToken.has(h.token)) byToken.set(h.token, []);
  byToken.get(h.token).push(`${h.file}:${h.line}`);
}
for (const h of hits) console.log(`${h.file}:${h.line}  ${h.token}  (${h.reason})`);
console.log(`\n${hits.length} unknown utilities, ${byToken.size} distinct:`);
for (const [token, where] of [...byToken].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(where.length).padStart(3)}  ${token}`);
}

if (process.argv.includes("--tailwind")) {
  const require = createRequire(join(repoRoot, "package.json"));
  const pkg = dirname(require.resolve("tailwindcss/package.json"));
  const tw = await import(join(pkg, "dist/lib.mjs"));
  const css = readFileSync(join(repoRoot, "src/app/globals.css"), "utf8").replace(/@import "tailwindcss"[^;]*;/, '@import "tailwindcss";');
  const ds = await tw.__unstable__loadDesignSystem(css, {
    base: join(repoRoot, "src/app"),
    async loadStylesheet(id, base) {
      const path = id === "tailwindcss" ? join(pkg, "index.css") : id.startsWith("tailwindcss/") ? join(pkg, `${id.slice(12).replace(/\.css$/, "")}.css`) : join(base, id);
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
  // Re-scan with a theme that knows nothing, so every prefixed utility is a candidate.
  const theme = loadTheme();
  const open = { ...theme, colors: new Set(), radius: new Set(), font: new Set(), fontWeight: new Set(), text: new Set(), textShadow: new Set(), shadow: new Set() };
  const candidates = [...new Set(scanRepo({ theme: open }).map((h) => h.token))];
  const out = ds.candidatesToCss(candidates);
  const missing = candidates.filter((c, i) => !out[i] && !theme.definedClasses.has(c.split(":").pop()));
  console.log(`\nTailwind compiler cross-check: ${candidates.length} prefixed candidates, ${missing.length} emit no CSS`);
  for (const c of missing) console.log(`  ${c}`);
  if (missing.length) process.exitCode = 1;
}

if (hits.length) process.exitCode = 1;
