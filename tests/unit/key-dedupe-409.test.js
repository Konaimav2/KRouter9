// U1b: upstream key dedupe — same trimmed key on the same provider is a 409
// naming the existing connection. Scope per-provider, constant-time SHA-256.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  timingSafeApiKeyEqual,
  findDuplicateApiKeyConnection,
} from "../../src/lib/db/repos/connectionsRepo.js";

const originalDataDir = process.env.DATA_DIR;
let tempDir;

// Route import pulls the full app graph; allow headroom under parallel load.
vi.setConfig({ testTimeout: 60000 });

function jsonRequest(body) {
  return new Request("http://localhost/api/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kr9-dedupe-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
  vi.doMock("next/server", () => ({
    NextResponse: {
      json(body, init = {}) {
        return new Response(JSON.stringify(body), {
          status: init.status || 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  }));
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("timingSafeApiKeyEqual", () => {
  it("matches trimmed variants, rejects empties and non-strings", () => {
    expect(timingSafeApiKeyEqual("sk-abc", "  sk-abc  ")).toBe(true);
    expect(timingSafeApiKeyEqual("sk-abc", "sk-abd")).toBe(false);
    expect(timingSafeApiKeyEqual("", "sk-abc")).toBe(false);
    expect(timingSafeApiKeyEqual("sk-abc", "")).toBe(false);
    expect(timingSafeApiKeyEqual(null, "sk-abc")).toBe(false);
  });
});

describe("findDuplicateApiKeyConnection", () => {
  it("finds by key, skips keyless rows and blank input", () => {
    const all = [{ id: "a", name: "A", apiKey: "sk-1" }, { id: "b", name: "B" }];
    expect(findDuplicateApiKeyConnection(all, "sk-1")?.id).toBe("a");
    expect(findDuplicateApiKeyConnection(all, " sk-1 ")?.id).toBe("a");
    expect(findDuplicateApiKeyConnection(all, "sk-2")).toBeNull();
    expect(findDuplicateApiKeyConnection(all, "  ")).toBeNull();
  });
});

describe("POST /api/providers dedupe", () => {
  it("second identical key on same provider is 409 naming the first", async () => {
    const { POST } = await import("@/app/api/providers/route.js");
    const first = await POST(jsonRequest({ provider: "openai", name: "K1", apiKey: "sk-dupe-1" }));
    expect(first.status).toBe(201);
    const second = await POST(jsonRequest({ provider: "openai", name: "K2", apiKey: "  sk-dupe-1 " }));
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toContain("K1");
  });

  it("same key on a different provider is allowed", async () => {
    const { POST } = await import("@/app/api/providers/route.js");
    const first = await POST(jsonRequest({ provider: "openai", name: "K1", apiKey: "sk-shared-9" }));
    expect(first.status).toBe(201);
    const second = await POST(jsonRequest({ provider: "anthropic", name: "K1x", apiKey: "sk-shared-9" }));
    expect(second.status).toBe(201);
  });
});
