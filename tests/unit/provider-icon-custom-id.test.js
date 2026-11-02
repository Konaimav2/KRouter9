import { describe, it, expect } from "vitest";
import { getProviderIconSrc } from "../../src/shared/utils/providerIcon.js";

describe("provider icon resolution", () => {
  it("returns the packaged logo for a known provider", () => {
    expect(getProviderIconSrc("codex")).toBe("/providers/codex.png");
    expect(getProviderIconSrc("anthropic")).toBe("/providers/anthropic.png");
  });

  it("never requests a logo for generated custom connection ids", () => {
    expect(
      getProviderIconSrc("openai-compatible-chat-34b1e334-10a6-400d-aab5-6f23f29fe4cc")
    ).toBeNull();
    expect(
      getProviderIconSrc("anthropic-compatible-c9b81abd-b15a-4e53-ba6b-cfdf09b546e4")
    ).toBeNull();
  });

  it("returns null for an empty id", () => {
    expect(getProviderIconSrc("")).toBeNull();
    expect(getProviderIconSrc(null)).toBeNull();
  });
});
