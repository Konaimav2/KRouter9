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
// ui-fix Wave B: consumers gate with isRunBlocked (reveal state never blocks);
// the loading/keysError threading contract carries over unchanged.
const gateCalls = (s) => s.match(/isRunBlocked\(\{[^}]*\}\)/g) || [];

describe("G4I RED: loading/keysError threaded into every key gate", () => {
  for (const k of Object.keys(FILES)) {
    it(`${k}: isRunBlocked receives loading + keysError`, () => {
      const calls = gateCalls(src(k));
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) {
        expect(c).toMatch(/loading/);
        expect(c).toMatch(/keysError/);
      }
    });
  }
});

// Superseded by ui-fix Wave B: no consumer reveals on selection any more, so
// the stale-reveal race moves into useOnDemandKey (cache keyed by id, cleared
// by reset() on every selection change). Pin that wiring instead.
describe("G4I: selection changes drop the on-demand cache", () => {
  for (const k of ["tts", "embedding", "generic", "stt", "combo", "mitm"]) {
    it(`${k}: no direct reveal; selection change calls onDemand.reset()`, () => {
      const s = src(k);
      expect(s).not.toMatch(/revealKeyById/);
      expect(s).toMatch(/onDemand\.reset\(\)/);
    });
  }
});
