import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import {
  pickDefaultKeyId,
  revealKeyById,
  labelForMaskedKey,
  isKeyActionBlocked,
} from "@/lib/maskedKeyClient.js";

// Populated masked-list fixture, shaped like GET /api/keys (sanitizeApiKeyRow:
// id/name/maskedKey/isActive, never raw). Poison `key` fields prove the
// resolver never consumes raw material from list payloads.
const MASKED_KEYS = [
  { id: "k2", name: "Old", maskedKey: "sk-ant-...cd34", key: "POISON-RAW-k2", isActive: false },
  { id: "k1", name: "Main", maskedKey: "sk-ant-...ab12", key: "POISON-RAW-k1", isActive: true },
];

function fetchMock({ ok = true, status = 200, body = {} } = {}) {
  const calls = [];
  const fn = vi.fn(async (url, opts) => {
    calls.push([url, opts]);
    return { ok, status, async json() { return body; } };
  });
  return { fn, calls };
}

describe("g4d masked-key resolution (behavioral)", () => {
  it("auto-picks the first ACTIVE key id, skipping inactive entries", () => {
    expect(pickDefaultKeyId(MASKED_KEYS)).toBe("k1");
  });

  it("empty / missing list yields null (caller falls back to manual entry)", () => {
    expect(pickDefaultKeyId([])).toBeNull();
    expect(pickDefaultKeyId(null)).toBeNull();
    expect(pickDefaultKeyId([{ id: "x", isActive: false }])).toBeNull();
  });

  it("resolves ONLY via the guarded single-record reveal URL, never list raw", async () => {
    const { fn, calls } = fetchMock({ body: { key: "live-raw-k1" } });
    const raw = await revealKeyById("k1", fn);
    expect(raw).toBe("live-raw-k1");
    expect(raw).not.toMatch(/POISON/);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls[0][0]).toBe("/api/keys/k1/reveal?confirm=true");
    expect(calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("reveal failure surfaces the server message and yields no key", async () => {
    const { fn } = fetchMock({ ok: false, status: 403, body: { error: "confirm required" } });
    await expect(revealKeyById("k1", fn)).rejects.toThrow("confirm required");
  });

  it("reveal with no key in body throws instead of returning list poison", async () => {
    const { fn } = fetchMock({ body: {} });
    await expect(revealKeyById("k1", fn)).rejects.toThrow();
  });

  it("missing id throws before any fetch", async () => {
    const { fn } = fetchMock({ body: { key: "live-raw" } });
    await expect(revealKeyById("", fn)).rejects.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });

  it("labels show id/name + masked value, never raw", () => {
    expect(labelForMaskedKey(MASKED_KEYS[1])).toBe("Main (sk-ant-...ab12)");
    expect(labelForMaskedKey({ id: "k9" })).toBe("k9 (masked)");
    for (const k of MASKED_KEYS) {
      expect(labelForMaskedKey(k)).not.toContain("POISON");
    }
  });

  it("gating: blocked while resolving, on error, or while keys await resolution", () => {
    // Still resolving the chosen key -> blocked.
    expect(isKeyActionBlocked({ keys: MASKED_KEYS, rawKey: "", resolving: true, error: "" })).toBe(true);
    // Reveal failed -> blocked (no silent dummy key).
    expect(isKeyActionBlocked({ keys: MASKED_KEYS, rawKey: "", resolving: false, error: "403" })).toBe(true);
    // Keys exist but nothing resolved yet -> blocked.
    expect(isKeyActionBlocked({ keys: MASKED_KEYS, rawKey: "", resolving: false, error: "" })).toBe(true);
    // Resolved -> allowed.
    expect(isKeyActionBlocked({ keys: MASKED_KEYS, rawKey: "live-raw-k1", resolving: false, error: "" })).toBe(false);
    // No keys at all -> nothing to resolve, manual entry allowed.
    expect(isKeyActionBlocked({ keys: [], rawKey: "", resolving: false, error: "" })).toBe(false);
  });
});

const read = (p) => fs.readFileSync(p, "utf8");

const MEDIA_CARDS = [
  "src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/EmbeddingExampleCard.js",
  "src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/GenericExampleCard.js",
  "src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/SttExampleCard.js",
  "src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/TtsExampleCard.js",
];

describe("g4f consumer-level masked resolution (each consumer)", () => {
  it.each(MEDIA_CARDS)("%s resolves via pickDefaultKeyId + revealKeyById in useEffect", (file) => {
    const s = read(file);
    expect(s).toMatch(/pickDefaultKeyId/);
    expect(s).toMatch(/revealKeyById/);
    // Reveal URL must be the guarded single-record endpoint with confirm.
    expect(s).toMatch(/revealKeyById|reveal\?confirm=true/);
  });

  it.each(MEDIA_CARDS)("%s catch sets key error state, never empty swallow", (file) => {
    const s = read(file);
    expect(s).toMatch(/setKeyError/);
    expect(s).not.toMatch(/\.catch\(\(\)\s*=>\s*\{\}\)/);
  });

  it.each(MEDIA_CARDS)("%s gates Run via isKeyActionBlocked", (file) => {
    const s = read(file);
    expect(s).toMatch(/isKeyActionBlocked/);
  });

  it.each(MEDIA_CARDS)("%s never reads raw .key from the masked list payload", (file) => {
    const s = read(file);
    // Raw list-key grabs: find(...)?.key and apiKeys[0].key patterns.
    expect(s).not.toMatch(/\.find\([^)]*\)\?\.key/);
    expect(s).not.toMatch(/apiKeys\[0\]\.key/);
    expect(s).not.toMatch(/keys\[0\]\.key/);
  });

  it.each(MEDIA_CARDS)("%s surfaces key errors with role=alert", (file) => {
    const s = read(file);
    expect(s).toMatch(/role="alert"/);
    expect(s).toMatch(/keyError/);
  });

  it("media combo [id] page resolves via pickDefaultKeyId + reveal + blocked gating", () => {
    const s = read("src/app/(dashboard)/dashboard/media-providers/combo/[id]/page.js");
    expect(s).toMatch(/pickDefaultKeyId/);
    expect(s).toMatch(/revealKeyById/);
    expect(s).toMatch(/isKeyActionBlocked/);
    expect(s).toMatch(/setKeyError/);
    expect(s).not.toMatch(/\.find\([^)]*\)\?\.key/);
  });

  it("MitmServerCard offers id-options, resolves via reveal, gates Start, no silent sk_krouter9 fallback", () => {
    const s = read("src/app/(dashboard)/dashboard/cli-tools/components/MitmServerCard.js");
    expect(s).toMatch(/pickDefaultKeyId/);
    expect(s).toMatch(/revealKeyById/);
    expect(s).toMatch(/isKeyActionBlocked/);
    expect(s).toMatch(/role="alert"/);
    // Id-based option values carry ids, raw secrets never land in option values.
    expect(s).toMatch(/value=\{[^}]*\.id[^}]*\}/);
    expect(s).not.toMatch(/value=\{[^}]*\.key[^}]*\}/);
    // No silent dummy fallback: sk_krouter9 must not appear as an implicit key value.
    expect(s).not.toMatch(/\|\|\s*\(\s*!cloudEnabled\s*\?\s*"sk_krouter9"/);
    expect(s).not.toMatch(/apiKeys\[0\]\.key/);
  });

  it("MitmToolCard drops the orphan apiKeys prop", () => {
    const s = read("src/app/(dashboard)/dashboard/cli-tools/components/MitmToolCard.js");
    expect(s).not.toMatch(/apiKeys/);
  });

  it("MitmPageClient stops passing the orphan apiKeys prop to MitmToolCard", () => {
    const s = read("src/app/(dashboard)/dashboard/mitm/MitmPageClient.js");
    expect(s).not.toMatch(/MitmToolCard[^>]*apiKeys=\{apiKeys\}/);
  });
});
