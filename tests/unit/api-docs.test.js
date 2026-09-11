import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(repoRoot, p), "utf8");

// P4: public API documentation.
describe("API documentation (P4)", () => {
  it("ships a valid OpenAPI spec covering the v1 surface", () => {
    const yaml = read("docs/openapi.yaml");
    expect(yaml).toMatch(/openapi:\s*3\./);
    for (const p of ["/v1/chat/completions", "/v1/responses", "/v1/messages", "/v1/embeddings", "/v1/models"]) {
      expect(yaml).toContain(p);
    }
  });

  it("exposes the spec over an unauthenticated route", () => {
    const route = read("src/app/api/docs/openapi.yaml/route.js");
    expect(route).toMatch(/openapi\.yaml/);
    const guard = read("src/dashboardGuard.js");
    expect(guard).toMatch(/\/api\/docs/);
  });

  it("includes the spec in production artifacts (standalone/Docker/CLI)", () => {
    // The route reads docs/openapi.yaml via process.cwd(); Next's tracer cannot
    // see it, so it must be declared + copied explicitly or it 404s in prod.
    const nextConfig = read("next.config.mjs");
    expect(nextConfig).toMatch(/outputFileTracingIncludes/);
    expect(nextConfig).toMatch(/docs\/openapi\.yaml/);
    const docker = read("Dockerfile");
    expect(docker).toMatch(/docs\/openapi\.yaml/);
    const buildCli = read("cli/scripts/build-cli.js");
    expect(buildCli).toMatch(/docs.*openapi\.yaml/);
  });

  it("ships a /docs reference page", () => {
    const page = read("src/app/docs/page.js");
    expect(page).toMatch(/KRouter9 API Reference/);
    expect(page).toMatch(/\/v1\/chat\/completions/);
  });

  it("footer links point at real docs routes", () => {
    const footer = read("src/shared/components/Footer.js");
    expect(footer).toContain('"/docs"');
    expect(footer).toContain("/api/docs/openapi.yaml");
  });

  it("API-AUTOMATION documents v1 auth + non-chat routes", () => {
    const doc = read("docs/API-AUTOMATION.md");
    expect(doc).toMatch(/Auth semantics/);
    expect(doc).toMatch(/Non-chat routes/);
    expect(doc).toMatch(/creditLimit/);
  });
});
