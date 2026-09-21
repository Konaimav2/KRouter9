// isActive stickiness: re-adding an existing provider connection via
// createProviderConnection may only deactivate (isActive:false), never
// reactivate; only explicit updateProviderConnection flips it back.
// Guards the stickyActive branch in connectionsRepo.js (~L220-230) and the
// provider-nodes [id] propagation path (route.js ~L82-104) which patches
// providerSpecificData without touching isActive.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-isactive-"));
  process.env.DATA_DIR = tempDir;
  // Reset global singleton so each test gets fresh adapter pointed at tempDir
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  // Close adapter to release file handles before rm
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

async function freshDb() {
  const { getAdapter } = await import("@/lib/db/driver.js");
  await getAdapter();
  return import("@/lib/db/index.js");
}

describe("isActive stickiness on re-add (createProviderConnection upsert)", () => {
  it("oauth: create disabled -> re-create without isActive stays false", async () => {
    const db = await freshDb();
    const first = await db.createProviderConnection({
      provider: "sticky-oauth",
      authType: "oauth",
      email: "sticky@example.com",
      accessToken: "tok-1",
      isActive: false,
    });
    expect(first.isActive).toBe(false);

    const again = await db.createProviderConnection({
      provider: "sticky-oauth",
      authType: "oauth",
      email: "sticky@example.com",
      accessToken: "tok-2",
    });
    expect(again.id).toBe(first.id);
    expect(again.isActive).toBe(false);
    // Other fields still merge through — only isActive is sticky.
    expect(again.accessToken).toBe("tok-2");

    const back = await db.getProviderConnectionById(first.id);
    expect(back.isActive).toBe(false);
    expect(back.accessToken).toBe("tok-2");
  });

  it("apikey: create disabled -> re-create without isActive stays false", async () => {
    const db = await freshDb();
    const first = await db.createProviderConnection({
      provider: "sticky-apikey",
      authType: "apikey",
      name: "sticky-key",
      apiKey: "k1",
      isActive: false,
    });
    expect(first.isActive).toBe(false);

    const again = await db.createProviderConnection({
      provider: "sticky-apikey",
      authType: "apikey",
      name: "sticky-key",
      apiKey: "k2",
    });
    expect(again.id).toBe(first.id);
    expect(again.isActive).toBe(false);
    expect(again.apiKey).toBe("k2");
  });

  it("re-create WITH isActive:true does NOT reactivate a disabled conn", async () => {
    const db = await freshDb();
    const first = await db.createProviderConnection({
      provider: "sticky-noauto",
      authType: "oauth",
      email: "noauto@example.com",
      accessToken: "tok-1",
      isActive: false,
    });

    const again = await db.createProviderConnection({
      provider: "sticky-noauto",
      authType: "oauth",
      email: "noauto@example.com",
      accessToken: "tok-2",
      isActive: true,
    });
    expect(again.id).toBe(first.id);
    expect(again.isActive).toBe(false);
    expect(await db.getProviderConnectionById(first.id)).toMatchObject({ isActive: false });
  });

  it("re-create WITH isActive:false deactivates an active conn", async () => {
    const db = await freshDb();
    const first = await db.createProviderConnection({
      provider: "sticky-deact",
      authType: "oauth",
      email: "deact@example.com",
      accessToken: "tok-1",
    });
    expect(first.isActive).toBe(true);

    const again = await db.createProviderConnection({
      provider: "sticky-deact",
      authType: "oauth",
      email: "deact@example.com",
      accessToken: "tok-1",
      isActive: false,
    });
    expect(again.id).toBe(first.id);
    expect(again.isActive).toBe(false);
    expect(await db.getProviderConnectionById(first.id)).toMatchObject({ isActive: false });
  });

  it("explicit updateProviderConnection(id, {isActive:true}) flips back to true", async () => {
    const db = await freshDb();
    const first = await db.createProviderConnection({
      provider: "sticky-flip",
      authType: "oauth",
      email: "flip@example.com",
      accessToken: "tok-1",
      isActive: false,
    });

    const flipped = await db.updateProviderConnection(first.id, { isActive: true });
    expect(flipped.isActive).toBe(true);
    expect(await db.getProviderConnectionById(first.id)).toMatchObject({ isActive: true });
  });
});

describe("node propagation guard (provider-nodes [id] route psd-only patch)", () => {
  it("psd-only update preserves isActive:true", async () => {
    const db = await freshDb();
    const conn = await db.createProviderConnection({
      provider: "node-1",
      authType: "apikey",
      name: "n1-key",
      apiKey: "k",
      providerSpecificData: { prefix: "old", baseUrl: "https://old.example", nodeName: "Old" },
    });
    expect(conn.isActive).toBe(true);

    // Mirrors src/app/api/provider-nodes/[id]/route.js ~L82-104: psd patch, no isActive.
    const updated = await db.updateProviderConnection(conn.id, {
      providerSpecificData: {
        ...(conn.providerSpecificData || {}),
        prefix: "new",
        baseUrl: "https://new.example",
        nodeName: "New",
      },
    });
    expect(updated.isActive).toBe(true);
    const back = await db.getProviderConnectionById(conn.id);
    expect(back.isActive).toBe(true);
    expect(back.providerSpecificData).toMatchObject({ prefix: "new", nodeName: "New" });
  });

  it("psd-only update preserves isActive:false", async () => {
    const db = await freshDb();
    const conn = await db.createProviderConnection({
      provider: "node-2",
      authType: "apikey",
      name: "n2-key",
      apiKey: "k",
      isActive: false,
      providerSpecificData: { prefix: "old", baseUrl: "https://old.example", nodeName: "Old" },
    });

    const updated = await db.updateProviderConnection(conn.id, {
      providerSpecificData: { ...(conn.providerSpecificData || {}), prefix: "new" },
    });
    expect(updated.isActive).toBe(false);
    expect(await db.getProviderConnectionById(conn.id)).toMatchObject({ isActive: false });
  });
});
