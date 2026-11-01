import { describe, it, expect } from "vitest";
import {
  OPENCODE_FREE_STATE,
  RETIRED_OPENCODE_FREE_MODELS,
  baseOpencodeModelId,
  classifyOpencodeProbe,
  getOpencodeRetirement,
} from "../../open-sse/providers/opencodeFreeStatus.js";

// FR-8b — "is this model still in service?" must be answered from what the API says,
// not from the catalog. The payloads below are the exact bodies captured on 2026-10-25.

const FREE_LIMIT = JSON.stringify({
  type: "error",
  error: {
    type: "FreeUsageLimitError",
    message:
      "Free usage limit reached. Free models work in OpenCode (https://opencode.ai); subscribe to OpenCode Go to keep going: https://opencode.ai/go",
  },
});

const DEPRECATED_WITH_REPLACEMENT = JSON.stringify({
  type: "error",
  error: {
    type: "ModelDeprecated",
    message: "Model mimo-v2.5-free has been deprecated. Use mimo-v2.6-flash-free instead.",
  },
  metadata: { model: "mimo-v2.5-free", replacement: "mimo-v2.6-flash-free" },
});

const DEPRECATED = JSON.stringify({
  type: "error",
  error: { type: "ModelDeprecated", message: "Model muse-spark-1.3-contributor-free has been deprecated." },
  metadata: { model: "muse-spark-1.3-contributor-free" },
});

const UNAVAILABLE = JSON.stringify({
  error: { type: "server_error", message: "Upstream request failed: Model is unavailable." },
});

describe("classifyOpencodeProbe", () => {
  it("treats 200 as live", () => {
    expect(classifyOpencodeProbe(200, "{}")).toMatchObject({ state: OPENCODE_FREE_STATE.LIVE });
  });

  it("treats the free-tier limit as live, not retired", () => {
    // This is the case that made the catalog misleading: the model exists, the shared
    // free tier is just rate limited.
    expect(classifyOpencodeProbe(429, FREE_LIMIT)).toMatchObject({
      state: OPENCODE_FREE_STATE.LIVE,
      replacement: null,
    });
  });

  it("reads the migration target out of a deprecation", () => {
    expect(classifyOpencodeProbe(410, DEPRECATED_WITH_REPLACEMENT)).toMatchObject({
      state: OPENCODE_FREE_STATE.RETIRED,
      replacement: "mimo-v2.6-flash-free",
    });
  });

  it("marks a deprecation without a successor as retired", () => {
    const verdict = classifyOpencodeProbe(410, DEPRECATED);
    expect(verdict.state).toBe(OPENCODE_FREE_STATE.RETIRED);
    expect(verdict.replacement).toBeNull();
  });

  it("marks 'Model is unavailable' as retired", () => {
    expect(classifyOpencodeProbe(400, UNAVAILABLE)).toMatchObject({
      state: OPENCODE_FREE_STATE.RETIRED,
      replacement: null,
    });
  });

  it("marks payment states as no longer free", () => {
    expect(classifyOpencodeProbe(402, "{}").state).toBe(OPENCODE_FREE_STATE.NOT_FREE);
    expect(classifyOpencodeProbe(403, "{}").state).toBe(OPENCODE_FREE_STATE.NOT_FREE);
    expect(
      classifyOpencodeProbe(400, JSON.stringify({ error: { message: "This model requires a paid plan." } })).state
    ).toBe(OPENCODE_FREE_STATE.NOT_FREE);
  });

  it("does not mistake the free-tier upsell for a paid model", () => {
    // The 429 body literally says "subscribe", which must not read as "no longer free".
    const verdict = classifyOpencodeProbe(429, FREE_LIMIT);
    expect(verdict.state).not.toBe(OPENCODE_FREE_STATE.NOT_FREE);
  });

  it("marks unknown models and unreadable bodies as unknown", () => {
    expect(classifyOpencodeProbe(404, "{}").state).toBe(OPENCODE_FREE_STATE.UNKNOWN);
    expect(classifyOpencodeProbe(500, "not json").state).toBe(OPENCODE_FREE_STATE.UNKNOWN);
    expect(classifyOpencodeProbe(0, "").state).toBe(OPENCODE_FREE_STATE.UNKNOWN);
  });
});

describe("getOpencodeRetirement", () => {
  it("returns the migration hint for a retired free-lane model", () => {
    const hit = getOpencodeRetirement("opencode", "mimo-v2.5-free");
    expect(hit).toMatchObject({ model: "mimo-v2.5-free", replacement: "mimo-v2.6-flash-free" });
    expect(hit.message).toContain("Use mimo-v2.6-flash-free instead");
  });

  it("normalizes the alias, vendor prefix and thinking suffix", () => {
    expect(getOpencodeRetirement("oc", "oc/mimo-v2.5-free(high)")).toMatchObject({
      model: "mimo-v2.5-free",
    });
  });

  it("leaves the rotating Muse Spark family retryable", () => {
    // The free catalog rotates, so a months-old deprecation must not block forever.
    expect(getOpencodeRetirement("opencode", "muse-spark-1.3-contributor-free")).toBeNull();
    expect(getOpencodeRetirement("oc", "oc/muse-spark-1.2-contributor-free(high)")).toBeNull();
  });

  it("leaves served models alone", () => {
    expect(getOpencodeRetirement("opencode", "mimo-v2.6-flash-free")).toBeNull();
    expect(getOpencodeRetirement("opencode", "nemotron-3-ultra-free")).toBeNull();
    expect(getOpencodeRetirement("opencode", "big-pickle")).toBeNull();
  });

  it("does not guard the keyed Zen lane", () => {
    // A paid plan can still reach models the free lane retired, so the free-lane
    // retirement table must not block Zen.
    expect(getOpencodeRetirement("opencode-zen", "mimo-v2.5-free")).toBeNull();
  });

  it("ignores other providers", () => {
    expect(getOpencodeRetirement("openrouter", "mimo-v2.5-free")).toBeNull();
    expect(getOpencodeRetirement(null, "mimo-v2.5-free")).toBeNull();
  });
});

describe("retirement table consistency", () => {
  it("covers exactly the ids removed from the free-lane catalog", () => {
    expect([...RETIRED_OPENCODE_FREE_MODELS.keys()].sort()).toEqual([
      "deepseek-v4-flash-free",
      "ling-3.0-flash-fin-free",
      "mimo-v2.5-free",
    ]);
  });

  it("does not list a served model as retired", () => {
    for (const live of ["nemotron-3-ultra-free", "mimo-v2.6-flash-free", "jev-1.13-free",
      "muse-spark-1.2-contributor-free", "muse-spark-1.3-contributor-free"]) {
      expect(RETIRED_OPENCODE_FREE_MODELS.has(live)).toBe(false);
    }
  });

  it("strips model decorations for lookup keys", () => {
    expect(baseOpencodeModelId("oc/mimo-v2.5-free(xhigh)")).toBe("mimo-v2.5-free");
    expect(baseOpencodeModelId("mimo-v2.5-free")).toBe("mimo-v2.5-free");
    expect(baseOpencodeModelId(null)).toBe("");
  });
});
