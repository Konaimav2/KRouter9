import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(__dirname, "../..");
const s = fs.readFileSync(path.join(root, "src/app/(dashboard)/dashboard/combos/page.js"), "utf8");
const between = (start, end) => {
  const a = s.indexOf(start);
  const b = s.indexOf(end, a + start.length);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return s.slice(a, b);
};

describe("combo toast fixes (2026-11-12)", () => {
  it("success toasts stay for create, save, delete and strategy", () => {
    expect(s).toMatch(/notify\.success\(`Combo “\$\{data\?\.name\}” created`\)/);
    expect(s).toMatch(/notify\.success\(`Combo “\$\{data\?\.name \|\| oldName\}” saved`\)/);
    expect(s).toMatch(/notify\.success\(`Combo “\$\{name\}” deleted`\)/);
    expect(s).toMatch(/notify\.success\("Combo strategy saved"\)/);
  });

  it("D3 delete network failure and non-ok both show an error toast with a reason", () => {
    const del = between("const handleDelete", "const handleSetComboStrategy");
    const catchBlock = del.slice(del.lastIndexOf("} catch (error) {"));
    expect(catchBlock).toMatch(/notify\.error\(`Could not delete combo “\$\{name\}”: network error\. Check the gateway and retry\.`\)/);
    expect(del).toMatch(/let reason = `HTTP \$\{res\.status\}`/);
    expect(del).toMatch(/notify\.error\(`Could not delete combo “\$\{name\}”: \$\{reason\}`\)/);
  });

  it("D5 re-clicking the active strategy or adapter mode is a no-op", () => {
    expect(s).toMatch(/if \(current === option\.value\) return; onSetStrategy\(\{ fallbackStrategy: option\.value \}\)/);
    expect(s).toMatch(/if \(!roundRobin\) return; patch\(\{ roundRobin: false \}\)/);
    expect(s).toMatch(/if \(roundRobin\) return; patch\(\{ roundRobin: true \}\)/);
  });

  it("D6 capacity adapter toast is coalesced, cleared on failure and unmount", () => {
    const fn = between("const handleSetCapacityAdapter", "const handleCreate");
    expect(fn.match(/fetch\("\/api\/settings"/g).length).toBe(1);
    expect(fn).toMatch(/clearTimeout\(adapterToastTimerRef\.current\);\s*adapterToastTimerRef\.current = setTimeout\(/);
    expect(fn).toMatch(/notify\.success\("Capacity adapter saved"\);\s*\}, 1500\)/);
    const catchBlock = fn.slice(fn.indexOf("} catch (error) {"));
    expect(catchBlock).toMatch(/clearTimeout\(adapterToastTimerRef\.current\)/);
    expect(catchBlock).not.toMatch(/notify\.success/);
    expect(s).toMatch(/useEffect\(\(\) => \(\) => clearTimeout\(adapterToastTimerRef\.current\), \[\]\)/);
  });

  it("D7 the card no longer announces its own save", () => {
    expect(s).not.toMatch(/setAnnouncement\([^)]*saved with/);
  });

  it("D9 a failed strategy migration on rename warns instead of claiming success", () => {
    const fn = between("const handleUpdate", "const handleRename");
    expect(fn).toMatch(/const migRes = await fetch\("\/api\/settings"/);
    expect(fn).toMatch(/if \(!migRes\.ok\) migrationError = `HTTP \$\{migRes\.status\}`/);
    expect(fn).toMatch(/migrationError = "network error"/);
    expect(fn).toMatch(/if \(!migrationError\) setComboStrategies\(updated\)/);
    expect(fn).toMatch(/if \(migrationError\) \{\s*notify\.warning\(`Combo “\$\{nextName\}” saved, but its routing strategy could not be moved \(\$\{migrationError\}\)\. Re-select the strategy\.`\);\s*\} else \{\s*notify\.success/);
  });
});

describe("combo toast round 2 + usage trend table removal (2026-11-13)", () => {
  it("keeps one live adapter toast by removing the previous one before showing a new one", () => {
    expect(s).toMatch(/adapterToastIdRef = useRef\(null\)/);
    expect(s).toMatch(/notify\.removeNotification\(adapterToastIdRef\.current\)/);
    expect(s).toMatch(/adapterToastIdRef\.current = notify\.success\("Capacity adapter saved"\)/);
  });
  it("Usage Trend has no data table or Period header, only a screen-reader summary", () => {
    const u = fs.readFileSync(path.join(root, "src/app/(dashboard)/dashboard/usage/components/UsageChart.js"), "utf8");
    expect(u).not.toMatch(/<table|<th\b|Period|Usage trend data table/);
    expect(u).toMatch(/className="sr-only">\{`Usage trend, /);
  });
});
