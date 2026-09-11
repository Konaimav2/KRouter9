import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

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

  it("handleChat honors the internal option", () => {
    const chat = read("src/sse/handlers/chat.js");
    expect(chat).toMatch(/if \(settings\.requireApiKey && !options\.internal\)/);
  });

  it("sidebar exposes the playground", () => {
    const sidebar = read("src/shared/components/Sidebar.js");
    expect(sidebar).toMatch(/\/dashboard\/basic-chat/);
    expect(sidebar).toMatch(/label:\s*"Playground"/);
  });
});
