import { describe, expect, it } from "vitest";

import {
  buildCustomProviderRouteSlugs,
  resolveCustomProviderId,
  slugifyCustomProviderName,
} from "../../src/app/(dashboard)/dashboard/providers/utils.js";

describe("slugifyCustomProviderName", () => {
  it("lowercases and converts spaces to dashes", () => {
    expect(slugifyCustomProviderName("My Custom Provider")).toBe("my-custom-provider");
  });

  it("preserves existing dashes", () => {
    expect(slugifyCustomProviderName("my-provider")).toBe("my-provider");
  });

  it("lowercases names like GripHub / GripHubCla", () => {
    expect(slugifyCustomProviderName("GripHub")).toBe("griphub");
    expect(slugifyCustomProviderName("GripHubCla")).toBe("griphubcla");
  });
});

describe("buildCustomProviderRouteSlugs", () => {
  it("uses routing prefixes for custom slugs", () => {
    const slugs = buildCustomProviderRouteSlugs([
      { id: "openai-compatible-chat-aaa", name: "GripHub", prefix: "grip" },
      { id: "openai-compatible-chat-bbb", name: "GripHub Claude", prefix: "gripcla" },
    ]);

    expect(slugs.get("openai-compatible-chat-aaa")).toBe("custom-grip");
    expect(slugs.get("openai-compatible-chat-bbb")).toBe("custom-gripcla");
  });

  it("trims and lowercases routing prefixes", () => {
    const slugs = buildCustomProviderRouteSlugs([
      { id: "id-normalized", name: "Ignored Name", prefix: "  GrIpClA  " },
    ]);

    expect(slugs.get("id-normalized")).toBe("custom-gripcla");
  });

  it("falls back to the name slug when no prefix is present", () => {
    const slugs = buildCustomProviderRouteSlugs([
      { id: "id-fallback", name: "Fallback Name" },
    ]);

    expect(slugs.get("id-fallback")).toBe("custom-fallback-name");
  });

  it("adds -2 / -3 suffixes on case-insensitive prefix collisions in order", () => {
    const slugs = buildCustomProviderRouteSlugs([
      { id: "id-1", name: "First", prefix: "shared" },
      { id: "id-2", name: "Second", prefix: " SHARED " },
      { id: "id-3", name: "Third", prefix: "Shared" },
    ]);

    expect([...slugs.values()]).toEqual([
      "custom-shared",
      "custom-shared-2",
      "custom-shared-3",
    ]);
  });
});

describe("resolveCustomProviderId", () => {
  const nodes = [
    { id: "openai-compatible-chat-aaa", name: "GripHub", prefix: "grip" },
    { id: "openai-compatible-chat-bbb", name: "GripHub Claude", prefix: "gripcla" },
  ];

  it("resolves prefix-based slugs to node ids", () => {
    expect(resolveCustomProviderId(nodes, "custom-grip")).toBe(
      "openai-compatible-chat-aaa",
    );
    expect(resolveCustomProviderId(nodes, "custom-gripcla")).toBe(
      "openai-compatible-chat-bbb",
    );
  });

  it("resolves the legacy id to the same node id", () => {
    expect(resolveCustomProviderId(nodes, "openai-compatible-chat-aaa")).toBe(
      "openai-compatible-chat-aaa",
    );
  });

  it("returns null for unknown params", () => {
    expect(resolveCustomProviderId(nodes, "custom-nope")).toBeNull();
  });
});
