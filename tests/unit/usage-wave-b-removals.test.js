import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { compile, hooks, nodes, marker, named } from "./usage-wave-b-harness.js";
const router = { push: vi.fn() }; let params;
function page(search) {
  params = new URLSearchParams(search); const h = hooks();
  const { UsageContent } = compile("page.js", { react: h.react, "next/navigation": { useRouter: () => router, useSearchParams: () => params }, "@/shared/components": { SegmentedControl: marker("control") }, ...Object.fromEntries(["UsageDashboard", "UsageLogs", "RequestDetailsTab", "PerKeyUsageSection"].map((n) => [`./components/${n}`, { __esModule: true, default: marker(n) }])) }, "\nexport { UsageContent };");
  return h.render(UsageContent);
}
beforeEach(() => router.push.mockReset());
describe("Wave B removal verdicts", () => {
  it("F18 removes page Export CSV", () => expect(renderToStaticMarkup(page(""))).not.toContain("Export CSV"));
  it("F17 hides Details period presets but keeps the Details surface", () => { const tree = page("tab=details"); expect(nodes(tree, named("control"))).toHaveLength(1); expect(nodes(tree, named("RequestDetailsTab"))).toHaveLength(1); });
  const logs = () => { const h = hooks([["10:00 | model | provider | route | 12 | 7 | OK"], false, "", true, "", "all", "all"]); const { default: Logs } = compile("components/UsageLogs.js", { react: h.react, "lucide-react": { CircleCheck: () => null, CircleX: () => null, CircleDashed: () => null }, "@/shared/components/Toggle": () => null }); return renderToStaticMarkup(h.render(Logs)); };
  it("F18 removes log Export", () => expect(logs()).not.toContain("Export visible logs"));
  it("F19 removes identical Route column", () => { expect(logs()).not.toMatch(/>Route</); expect(logs()).not.toMatch(/>\/v1</); });
  it("F20 removes unwired Open and Action column", () => { expect(logs()).not.toMatch(/>Open</); expect(logs()).not.toMatch(/>Action</); expect(logs().match(/<th /g)).toHaveLength(5); });
});
