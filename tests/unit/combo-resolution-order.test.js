import { describe, it, expect, vi } from "vitest";

// C1 RED proof — combo resolution-order bug (no source edits in this task).
//
// Context: `src/sse/services/model.js` `getModelInfo` lines 45-51 checks the
// tail segment of ANY slash-qualified request against the combo table FIRST
// and returns `{ provider: null }` (combo path) — even when the head segment
// is a known provider id/alias (`cx` = codex alias). So `cx/gpt-5.6-terra`
// with combo `gpt-5.6-terra` present never reaches provider resolution and is
// fed into the combo self-member pre-filter downstream
// (`src/sse/handlers/chat.js` lines 254-264), which drops it as a
// self-reference (papi: 7 members -> 2 tried).
//
// Fixture stubbing follows the established `@/lib/localDb` mock pattern
// (see `tests/unit/xai-video-handler.test.js` lines 30-35); `getModelInfo`
// cannot be exercised without `getComboByName`, and `combo-cycle-guard.test.js`
// only covers the pure `getComboModelsFromData` helper (no DB seam).

vi.mock("@/lib/localDb", () => ({
  getModelAliases: vi.fn(async () => ({})),
  getProviderNodes: vi.fn(async ({ type } = {}) =>
    type === "openai-compatible"
      ? [{ id: "openai-compatible-chat-tkhbnode", prefix: "tkhb", type }]
      : []
  ),
  getComboByName: vi.fn(async (name) =>
    name === "gpt-5.6-terra"
      ? {
          id: "combo-terra",
          name: "gpt-5.6-terra",
          kind: "fallback",
          models: [
            "cx/gpt-5.6-terra",
            "kiro/gpt-5.6-terra",
            "ohh/gpt-5.6-terra",
            "cc/gpt-5.6-terra",
            "acm/gpt-5.6-terra",
            "op/gpt-5.6-terra",
            "gm/gpt-5.6-terra",
          ],
        }
      : null
  ),
}));

import { getModelInfo } from "@/sse/services/model.js";

describe("combo resolution order", () => {
  it("routes cx/gpt-5.6-terra to provider cx, not the combo path", async () => {
    const info = await getModelInfo("cx/gpt-5.6-terra");
    // `cx` is the registry alias for provider `codex` — either form proves
    // the provider route won over the `{ provider: null }` combo path.
    expect(info.provider).not.toBeNull();
    expect(["cx", "codex"]).toContain(info.provider);
    expect(info.model).toBe("gpt-5.6-terra");
  });

  it("unknown-head slug still resolves to the combo (slug-qualify preserved)", async () => {
    const info = await getModelInfo("zzz/gpt-5.6-terra");
    expect(info).toEqual({ provider: null, model: "gpt-5.6-terra" });
  });

  it("bare combo name still resolves to the combo path", async () => {
    const info = await getModelInfo("gpt-5.6-terra");
    expect(info).toEqual({ provider: null, model: "gpt-5.6-terra" });
  });

  it("node prefix tkhb routes to the node, never the tokenharbor registry entry", async () => {
    // Regression: registry id `tkhb` hijacked the live tkhb node prefix
    // (RESERVED skipped node matching → "missing credentials" on papi).
    const info = await getModelInfo("tkhb/deepseek-v4.1-flash");
    expect(info.provider).toBe("openai-compatible-chat-tkhbnode");
    expect(info.model).toBe("deepseek-v4.1-flash");
  });
});
