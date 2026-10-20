import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";

const routeFixture = vi.hoisted(() => ({
  handleChat: vi.fn(),
  initTranslators: vi.fn(async () => {}),
}));
vi.mock("@/sse/handlers/chat.js", () => ({
  handleChat: routeFixture.handleChat,
}));
vi.mock("open-sse/translator/index.js", () => ({
  initTranslators: routeFixture.initTranslators,
}));
const { POST } = await import("@/app/api/dashboard/chat/completions/route.js");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(repoRoot, p), "utf8");

// Dashboard Playground: the Basic Chat page must have a same-origin backend
// route, run chat in internal mode (no end-user API key), and the sidebar must
// expose it.
describe("dashboard playground wiring", () => {
  it("ships a dashboard chat completions route", () => {
    const route = read("src/app/api/dashboard/chat/completions/route.js");
    expect(route).toMatch(/handleChat\(request, null, \{\s*internal:\s*true\s*\}\)/);
  });

  it("handleChat honors the internal option", async () => {
    // Route forwarding proof. Real internal/external/invalid-key behavior is
    // covered by v1-key-credential-boundary.test.js; admission by dashboard-guard.
    routeFixture.handleChat.mockClear();
    routeFixture.initTranslators.mockClear();
    const request = new Request("http://fixture.invalid/api/dashboard/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "fixture", messages: [] }),
    });
    const response = Response.json({ id: "dashboard-route-fixture" });
    routeFixture.handleChat.mockResolvedValueOnce(response);
    expect(await POST(request)).toBe(response);
    expect(routeFixture.handleChat).toHaveBeenCalledExactlyOnceWith(
      request, null, { internal: true },
    );
    expect(routeFixture.initTranslators).toHaveBeenCalledTimes(1);
  });

  it("sidebar exposes the playground", () => {
    const sidebar = read("src/shared/components/Sidebar.js");
    expect(sidebar).toMatch(/\/dashboard\/basic-chat/);
    // Label shape changed in the Switchboard Ledger redesign (tuple entries, not
    // {label:} objects) — assert the Playground entry itself, not the old shape.
    expect(sidebar).toMatch(/Playground/);
  });
});
