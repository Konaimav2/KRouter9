// Usage → Breakdown provider labels.
//
// Reported: the Breakdown listed the same model twice, one row with a real
// provider and one with an unattributable cell. Verified against a copy of the
// production DB: usage rows carry the raw routing id, and for custom providers
// that id is a generated `…-compatible-<uuid>` string. When the operator had
// since deleted the provider node there was no name to resolve, so the value was
// printed raw (or blank), which reads as a mismatch between two rows of the same
// model.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const { resolveProviderLabel } = await import("@/lib/db/repos/usageRepo.js");

const USAGE_REPO = new URL("../../src/lib/db/repos/usageRepo.js", import.meta.url);

describe("resolveProviderLabel", () => {
  it("prefers the configured node name", () => {
    const map = { "openai-compatible-chat-34b1e334-10a6-400d-aab5-6f23f29fe4cc": "OMA-GPT" };
    expect(
      resolveProviderLabel("openai-compatible-chat-34b1e334-10a6-400d-aab5-6f23f29fe4cc", map)
    ).toBe("OMA-GPT");
  });

  it("names a deleted custom node instead of printing its uuid", () => {
    // Exactly the production shape: the node is gone from providerNodes.
    expect(resolveProviderLabel("openai-compatible-chat-6d68d8e0-bf76-475e-920e-a5c64da27f3d", {}))
      .toBe("Custom OpenAI provider (6d68d8e0)");
    expect(resolveProviderLabel("anthropic-compatible-0b061d76-5aaf-4a80-b779-65efde693c15", {}))
      .toBe("Custom Anthropic provider (0b061d76)");
  });

  it("passes built-in providers through unchanged", () => {
    expect(resolveProviderLabel("tokenharbor", {})).toBe("tokenharbor");
    expect(resolveProviderLabel("codex", {})).toBe("codex");
    expect(resolveProviderLabel("opencode", {})).toBe("opencode");
  });

  it("never renders an empty cell", () => {
    expect(resolveProviderLabel(null, {})).toBe("Unknown provider");
    expect(resolveProviderLabel(undefined, {})).toBe("Unknown provider");
    expect(resolveProviderLabel("", {})).toBe("Unknown provider");
    expect(resolveProviderLabel("   ", {})).toBe("Unknown provider");
  });

  it("tolerates a missing name map", () => {
    expect(resolveProviderLabel("tokenharbor")).toBe("tokenharbor");
  });
});

describe("usageRepo label sites all go through the resolver", () => {
  it("has no raw `map[id] || id` fallbacks left", () => {
    const source = readFileSync(USAGE_REPO, "utf8");
    // The old shape returned the bare uuid (or "") for an unknown node.
    expect(source).not.toMatch(/providerNodeNameMap\[[^\]]+\]\s*\|\|\s*[a-zA-Z_.]+\s*\|\|\s*""/);
    expect(source).not.toMatch(/providerNodeNameMap\[[^\]]+\]\s*\|\|\s*[a-zA-Z_.]+\s*;/);
    expect(source).not.toMatch(/nodeNameMap\[[^\]]+\]\s*\|\|\s*[a-zA-Z_.]+\s*\|\|\s*""/);
    // And the label sites use the resolver.
    expect((source.match(/resolveProviderLabel\(/g) || []).length).toBeGreaterThanOrEqual(6);
  });
});
