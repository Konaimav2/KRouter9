import { describe, it, expect } from "vitest";
import { FILTERS } from "@/app/api/providers/suggested-models/filters.js";

describe("suggested-models filters for new providers", () => {
  it("tokenharbor-free keeps free models across shapes", () => {
    const out = FILTERS["tokenharbor-free"]([
      { id: "deepseek-v4.1-flash:free", name: "DeepSeek", pricing: { prompt: "0", completion: "0" } },
      { id: "grok-paid", name: "Grok", pricing: { prompt: "0.5", completion: "1" } },
      { id: "mimo-fallback", name: "Mimo", isFree: true },
    ]);
    const ids = out.map((m) => m.id);
    expect(ids).toContain("deepseek-v4.1-flash:free");
    expect(ids).toContain("mimo-fallback");
    expect(ids).not.toContain("grok-paid");
  });

  it("bai-free keeps zero-cost models", () => {
    const out = FILTERS["bai-free"]([
      { id: "qwen3.8-flash", pricing: { prompt: 0, completion: 0 } },
      { id: "gpt-paid", pricing: { prompt: 1, completion: 2 } },
    ]);
    expect(out.map((m) => m.id)).toEqual(["qwen3.8-flash"]);
  });

  it("agentrouter-all passes everything with ids", () => {
    const out = FILTERS["agentrouter-all"]([
      { id: "a", name: "A" },
      { name: "no-id" },
      { id: "b" },
    ]);
    expect(out.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("all three filters tolerate empty/non-array input", () => {
    for (const t of ["tokenharbor-free", "bai-free", "agentrouter-all"]) {
      expect(FILTERS[t]([])).toEqual([]);
    }
  });
});
