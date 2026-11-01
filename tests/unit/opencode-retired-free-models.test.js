import { describe, it, expect } from "vitest";
import opencodeFree from "../../open-sse/providers/registry/opencode.js";
import opencodeZen from "../../open-sse/providers/registry/opencode-zen.js";
import { isMuseSparkModel } from "../../open-sse/providers/models/helpers.js";
import { FILTERS } from "@/app/api/providers/suggested-models/filters.js";

// FR-8 — retired OpenCode free models. Verification source (2026-10-25):
// https://opencode.ai/zen/v1/models and /inference/v1/models both served 85 models and
// neither listed the IDs below. They must disappear from selection, while stored
// references (combos, key policies, usage history) keep rendering and routing.

// Removed from the static registries (the free lane selects from the live fetcher).
const REGISTRY_REMOVED = [
  "deepseek-v4-flash-free",
  "mimo-v2.5-free",
  "ling-3.0-flash-fin-free",
  "muse-spark-1.2-contributor-free",
  "muse-spark-1.3-contributor-free",
];

// Models the picker filter still suppresses. The free catalog rotates, so this list is
// time-boxed by the filter itself and intentionally excludes the Muse Spark family.
const HARD_FILTERED = [
  "deepseek-v4-flash-free",
  "mimo-v2.5-free",
  "ling-3.0-flash-fin-free",
];

const LIVE = [
  "beam-free",
  "deepseek-v4.1-flash-free",
  "flint-40b-free",
  "glm-5.3-flash-free",
  "jev-1.13-free",
  "mimo-v2.6-flash-free",
  "nemotron-3.5-lightning-free",
  "nemotron-3.5-super-vl-free",
  // Absent from the /models catalog but still served: the free-limit gate answers,
  // which proves the model exists (verified by live probe 2026-10-25).
  "nemotron-3-ultra-free",
];

describe("FR-8 retired OpenCode free models", () => {
  it("keeps no retired id selectable on either OpenCode lane", () => {
    const ids = [...opencodeFree.models, ...opencodeZen.models].map((model) => model.id);
    for (const retired of REGISTRY_REMOVED) expect(ids).not.toContain(retired);
  });

  it("leaves the free lane on the live fetcher instead of a stale static list", () => {
    expect(opencodeFree.passthroughModels).toBe(true);
    expect(opencodeFree.models).toEqual([]);
    expect(opencodeFree.modelsFetcher).toMatchObject({ type: "opencode-free" });
  });

  it("keeps the statically listed live free ids selectable", () => {
    const ids = opencodeZen.models.map((model) => model.id);
    expect(ids).toContain("mimo-v2.6-flash-free");
    expect(ids).toContain("nemotron-3.5-lightning-free");
    expect(ids).toContain("jev-1.13-free");
    // Unlisted upstream but still served — must stay selectable rather than be hidden.
    expect(ids).toContain("nemotron-3-ultra-free");
  });

  it("filters retired ids out of a stale upstream catalog", () => {
    const upstream = [
      ...REGISTRY_REMOVED.map((id) => ({ id, name: id })),
      ...LIVE.map((id) => ({ id, name: id })),
      { id: "big-pickle", name: "big-pickle" },
      { id: "claude-opus-5", name: "claude-opus-5" },
    ];

    const picked = FILTERS["opencode-free"](upstream).map((model) => model.id);

    for (const retired of HARD_FILTERED) expect(picked).not.toContain(retired);
    // Muse is retryable: upstream rotates the free catalog, so it is not blocked statically.
    expect(picked).toContain("muse-spark-1.3-contributor-free");
    for (const live of LIVE) expect(picked).toContain(live);
    expect(picked).toContain("big-pickle");
    expect(picked).not.toContain("claude-opus-5");
  });

  it("still recognizes a stored Muse Spark id so old references keep routing", () => {
    expect(isMuseSparkModel("muse-spark-1.3-contributor-free")).toBe(true);
    expect(isMuseSparkModel("oc/muse-spark-1.3-contributor-free(high)")).toBe(true);
    expect(isMuseSparkModel("mimo-v2.6-flash-free")).toBe(false);
  });
});
