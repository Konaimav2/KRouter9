// Gate: so kết quả test hiện tại với baseline known-fails.
// PASS nếu KHÔNG có test nào pass(baseline) → fail(now). Test mới được phép.
// Usage: node tests/__baseline__/verify-no-regression.mjs <current-results.json>
import { readFileSync } from "fs";

const knownFails = new Set(
  readFileSync(new URL("./known-fails.txt", import.meta.url), "utf8")
    .split("\n").map(s => s.trim()).filter(Boolean)
);

const resultsPath = process.argv[2];
if (!resultsPath) { console.error("Missing results.json path"); process.exit(2); }

const r = JSON.parse(readFileSync(resultsPath, "utf8"));
// File key: vitest names are repo-relative locally but /app/-prefixed in
// Docker. Normalize to the trailing path so both shapes key identically.
const fileKey = (name) => {
  const s = String(name || "");
  const app = s.lastIndexOf("/app/");
  if (app >= 0) return s.slice(app + 5);
  const t = s.indexOf("tests/");
  if (t >= 0) return s.slice(t);
  return s.replace(/^\.\//, "");
};
const nowFails = r.testResults.flatMap(f =>
  f.assertionResults.filter(a => a.status === "failed")
    .map(a => fileKey(f.name) + " :: " + a.fullName)
);

// Suites can fail before any assertion runs (collection/import errors). Those never
// appear in known-fails.txt, so they get their own baseline list.
const knownSuiteFails = new Set(
  readFileSync(new URL("./known-failed-suites.txt", import.meta.url), "utf8")
    .split("\n").map(s => s.trim()).filter(Boolean)
);
const baseName = (name) => String(name || "").split("/").pop();
const nowSuiteFails = r.testResults
  .filter(t => t.status === "failed" && !t.assertionResults.some(a => a.status === "failed"))
  .map(t => baseName(t.name));
const newSuiteFails = nowSuiteFails.filter(name => !knownSuiteFails.has(name));

// Regression = fail bây giờ NHƯNG không có trong baseline known-fails
const regressions = nowFails.filter(f => !knownFails.has(f));

if (regressions.length || newSuiteFails.length) {
  console.error(`\n❌ REGRESSION: ${regressions.length} test pass→fail, ${newSuiteFails.length} new suite failure(s):\n`);
  regressions.forEach(f => console.error("  - " + f));
  newSuiteFails.forEach(f => console.error("  - suite: " + f));
  process.exit(1);
}
console.log(`✅ No regression. (now fails=${nowFails.length}, baseline known=${knownFails.size}, suite fails=${nowSuiteFails.length} all known)`);
