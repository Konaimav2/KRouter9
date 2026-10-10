import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Wave G4J — final partials, TDD RED first.
//
// (1) Manual entry invalidates a pending reveal generation + clears stale
//     id/raw (Embedding manual input; Mitm empty/no-default branch).
// (2) Non-OK key-list responses enter error state (never settled-empty);
//     settled-empty requires an explicit credential (manual input where it
//     exists) or an explicit per-consumer keyless mode.

const SRC = new URL("../../src/", import.meta.url).pathname;
const FILES = {
  embedding:
    "app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/EmbeddingExampleCard.js",
  generic:
    "app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/GenericExampleCard.js",
  stt: "app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/SttExampleCard.js",
  tts: "app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/TtsExampleCard.js",
  mitm: "app/(dashboard)/dashboard/cli-tools/components/MitmServerCard.js",
  combo: "app/(dashboard)/dashboard/media-providers/combo/[id]/page.js",
};

const src = (k) => fs.readFileSync(path.join(SRC, FILES[k]), "utf8");
const windowAfter = (s, needle, len = 800) => {
  const i = s.indexOf(needle);
  expect(i).toBeGreaterThanOrEqual(0);
  return s.slice(i, i + len);
};

describe("G4J(1): manual entry invalidates pending reveal + clears stale state", () => {
  it("embedding: typing a manual key kills the in-flight auto-reveal and drops stale resolving/error", () => {
    const w = windowAfter(src("embedding"), "value={apiKey}", 800);
    // Bumps the reveal generation so a late completion cannot clobber input.
    expect(w).toMatch(/revealSeqRef\.current\s*(\+\+|\+=\s*1)/);
    // No stuck spinner / stale error blocking the typed credential.
    expect(w).toMatch(/setResolvingKey\(false\)/);
    expect(w).toMatch(/setKeyError\(""\)/);
    // The typed raw value wins.
    expect(w).toMatch(/setApiKey\(e\.target\.value\)/);
  });

  it("mitm: empty/no-default list kills in-flight reveal + clears stale id/raw", () => {
    const w = windowAfter(src("mitm"), "const id = pickDefaultKeyId(keys);", 300);
    expect(w).toMatch(/setSelectedKeyId\(""\)/);
    expect(w).toMatch(/resolveForSelection\(\s*""\s*\)/);
  });
});

describe("G4J(2a): non-OK key-list responses enter error state, never settled-empty", () => {
  for (const k of ["embedding", "generic", "stt", "tts"]) {
    it(`${k}: rejects non-OK /api/keys before parsing`, () => {
      const w = windowAfter(src(k), 'fetch("/api/keys")', 500);
      expect(w).toMatch(/!\s*r\.ok/);
      expect(w).toMatch(/throw/);
    });
  }

  it("combo: non-OK key list already enters error state (pinned)", () => {
    const w = windowAfter(src("combo"), 'fetch("/api/keys"', 700);
    expect(w).toMatch(/if \(keysRes\.ok\)/);
    expect(w).toMatch(/setKeysError/);
  });
});

describe("G4J(2b): settled-empty requires explicit credential or explicit keyless", () => {
  for (const k of ["generic", "stt", "combo"]) {
    it(`${k}: settled-empty list without a resolved credential stays blocked`, () => {
      const w = windowAfter(src(k), "const listEmptyOk", 500);
      expect(w).toMatch(/maskedKeys\.length > 0/);
      expect(w).toMatch(/!!apiKey/);
      expect(w).toMatch(/keyBlocked/);
    });
  }

  it("tts: settled-empty stays blocked except in explicit keyless mode (stored connections)", () => {
    const s = src("tts");
    const w = windowAfter(s, "const keyBlocked", 500);
    expect(w).toMatch(/keyless/);
    expect(s).toMatch(/const keyless = [^;]*connectionCount[^;]*;/);
  });

  it("manual-input carve-outs exist (embedding always-manual, mitm when empty) — pinned", () => {
    expect(src("embedding")).toContain('type="password"');
    expect(src("embedding")).toContain("value={apiKey}");
    expect(src("mitm")).toMatch(/Enter API key manually/);
  });
});
