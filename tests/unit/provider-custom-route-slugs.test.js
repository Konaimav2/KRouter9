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
  it("prefixes slugs with custom-", () => {
    const slugs = buildCustomProviderRouteSlugs([
      { id: "openai-compatible-chat-aaa", name: "GripHub" },
    ]);

    expect(slugs.get("openai-compatible-chat-aaa")).toBe("custom-griphub");
  });

  it("adds -2 / -3 suffixes on case-insensitive collisions in order", () => {
    const slugs = buildCustomProviderRouteSlugs([
      { id: "id-1", name: "Shared Name" },
      { id: "id-2", name: "shared name" },
      { id: "id-3", name: "SHARED NAME" },
    ]);

    expect([...slugs.values()]).toEqual([
      "custom-shared-name",
      "custom-shared-name-2",
      "custom-shared-name-3",
    ]);
  });
});

describe("resolveCustomProviderId", () => {
  const nodes = [
    { id: "openai-compatible-chat-aaa", name: "GripHub" },
    { id: "openai-compatible-chat-bbb", name: "GripHub" },
  ];

  it("resolves the slug to the node id", () => {
    expect(resolveCustomProviderId(nodes, "custom-griphub")).toBe(
      "openai-compatible-chat-aaa",
    );
    expect(resolveCustomProviderId(nodes, "custom-griphub-2")).toBe(
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
