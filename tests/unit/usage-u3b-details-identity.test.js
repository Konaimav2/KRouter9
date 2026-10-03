// U3b F09 — requestDetails persists MASKED key identity (never raw).
// RED-first: saveRequestDetail does not yet store apiKeyMasked/keyName.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;

const RAW = "sk-test-0123456789abcdef";

async function saveDetail(detail) {
  await db.saveRequestDetail(detail);
  await new Promise((r) => setTimeout(r, 150));
}

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-u3b-ident-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
  await db.updateSettings({ enableObservability: true, observabilityBatchSize: 1 });
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("F09 requestDetails masked key identity", () => {
  it("raw apiKey at save → stored masked, raw never persisted", async () => {
    await saveDetail({
      id: "u3b-raw-1", provider: "openai", model: "gpt-4",
      status: "success", tokens: {}, apiKey: RAW,
      request: {}, response: {},
    });
    const got = await db.getRequestDetailById("u3b-raw-1");
    expect(got.apiKeyMasked).toBe("sk-test-***");
    expect(JSON.stringify(got)).not.toContain(RAW);
    // Raw key must not survive under any field name
    expect(got.apiKey).toBeUndefined();
  });

  it("pre-masked identity passes through with caller keyName", async () => {
    await saveDetail({
      id: "u3b-pre-1", provider: "openai", model: "gpt-4",
      status: "success", tokens: {},
      apiKeyMasked: "sk-test-***", keyName: "ci-key",
      request: {}, response: {},
    });
    const got = await db.getRequestDetailById("u3b-pre-1");
    expect(got.apiKeyMasked).toBe("sk-test-***");
    expect(got.keyName).toBe("ci-key");
    expect(got.apiKey).toBeUndefined();
  });

  it("no key → fail-open nulls, row still readable", async () => {
    await saveDetail({
      id: "u3b-nokey-1", provider: "openai", model: "gpt-4",
      status: "error", tokens: {},
      request: {}, response: { error: "boom", status: 502 },
    });
    const got = await db.getRequestDetailById("u3b-nokey-1");
    expect(got.apiKeyMasked ?? null).toBeNull();
    expect(got.status).toBe("error");
  });
});
