import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// G4I RED: consumer-side race wiring. Prior session proved the helper gate +
// catalog cancel + Mitm/Generic/Stt guards; this file pins the remainder:
// Tts 2 call sites, Embedding auto-pick guard, and loading/keysError threaded
// into every isKeyActionBlocked call. Source-contract assertions match the
// repo's wave-*.test.js convention for UI wiring.
const SRC = new URL("../../src/", import.meta.url).pathname;
const FILES = {
  mitm: "app/(dashboard)/dashboard/cli-tools/components/MitmServerCard.js",
  generic:
    "app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/GenericExampleCard.js",
  stt: "app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/SttExampleCard.js",
  tts: "app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/TtsExampleCard.js",
  embedding:
    "app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/EmbeddingExampleCard.js",
  combo: "app/(dashboard)/dashboard/media-providers/combo/[id]/page.js",
};

const src = (k) => fs.readFileSync(path.join(SRC, FILES[k]), "utf8");
const gateCalls = (s) => s.match(/isKeyActionBlocked\(\{[^}]*\}\)/g) || [];

describe("G4I RED: loading/keysError threaded into every key gate", () => {
  for (const k of Object.keys(FILES)) {
    it(`${k}: isKeyActionBlocked receives loading + keysError`, () => {
      const calls = gateCalls(src(k));
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) {
        expect(c).toMatch(/loading/);
        expect(c).toMatch(/keysError/);
      }
    });
  }
});

describe("G4I RED: stale-reveal guard call sites", () => {
  it("tts: both reveal sites route through resolveForSelection", () => {
    const s = src("tts");
    expect((s.match(/resolveForSelection\(id\)/g) || []).length).toBeGreaterThanOrEqual(2);
    // Only remaining revealKeyById(id) is inside the helper definition.
    expect(s.split("revealKeyById(id)").length - 1).toBe(1);
  });

  it("embedding: auto-pick routes through a seq-guarded resolver", () => {
    const s = src("embedding");
    expect(s).toMatch(/revealSeqRef/);
    expect(s).toMatch(/resolveForSelection\(id\)/);
    expect(s.split("revealKeyById(id)").length - 1).toBe(1);
  });
});
