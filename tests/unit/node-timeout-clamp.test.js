import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// V8: node timeout override must be bounded so a huge value cannot pin a
// connect attempt for days.
const origDir = process.env.DATA_DIR;
let tmp;
let db;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kr9-timeout-"));
  process.env.DATA_DIR = tmp;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
});
afterAll(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  if (origDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = origDir;
});

describe("node timeout clamp (V8)", () => {
  it("clamps an absurdly large timeout to the max", async () => {
    const node = await db.createProviderNode({
      id: "openai-compatible-chat-t1",
      type: "openai-compatible",
      name: "t1",
      prefix: "t1",
      apiType: "chat",
      baseUrl: "https://example.test/v1",
      timeoutMs: 2147483647,
    });
    const back = await db.getProviderNodeById(node.id);
    expect(back.timeoutMs).toBe(300000);
  });

  it("clamps a tiny timeout up to the min", async () => {
    const node = await db.createProviderNode({
      id: "openai-compatible-chat-t2",
      type: "openai-compatible",
      name: "t2",
      prefix: "t2",
      apiType: "chat",
      baseUrl: "https://example.test/v1",
      timeoutMs: 5,
    });
    const back = await db.getProviderNodeById(node.id);
    expect(back.timeoutMs).toBe(1000);
  });

  it("clamps on update too", async () => {
    const node = await db.createProviderNode({
      id: "openai-compatible-chat-t3",
      type: "openai-compatible",
      name: "t3",
      prefix: "t3",
      apiType: "chat",
      baseUrl: "https://example.test/v1",
      timeoutMs: 5000,
    });
    await db.updateProviderNode(node.id, { timeoutMs: 999999999 });
    const back = await db.getProviderNodeById(node.id);
    expect(back.timeoutMs).toBe(300000);
  });

  it("keeps a valid in-range timeout", async () => {
    const node = await db.createProviderNode({
      id: "openai-compatible-chat-t4",
      type: "openai-compatible",
      name: "t4",
      prefix: "t4",
      apiType: "chat",
      baseUrl: "https://example.test/v1",
      timeoutMs: 45000,
    });
    const back = await db.getProviderNodeById(node.id);
    expect(back.timeoutMs).toBe(45000);
  });
});
