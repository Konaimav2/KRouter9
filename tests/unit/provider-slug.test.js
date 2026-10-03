import { describe, expect, it } from "vitest";

import { buildCustomProviderDisplaySlugs } from "../../src/app/(dashboard)/dashboard/providers/utils.js";

describe("buildCustomProviderDisplaySlugs", () => {
  it("formats spaces as dashes", () => {
    const slugs = buildCustomProviderDisplaySlugs([
      { id: "custom-id", name: "  My Custom Provider  " },
    ]);

    expect(slugs.get("custom-id")).toBe("provider/My-Custom-Provider");
  });

  it("adds case-insensitive duplicate suffixes in occurrence order", () => {
    const slugs = buildCustomProviderDisplaySlugs([
      { id: "first", name: "Shared Name" },
      { id: "second", name: "shared name" },
      { id: "third", name: "SHARED NAME" },
    ]);

    expect([...slugs.values()]).toEqual([
      "provider/Shared-Name",
      "provider/shared-name-2",
      "provider/SHARED-NAME-3",
    ]);
  });

  it("keeps provider ids unchanged because slugs are display-only", () => {
    const nodes = [
      { id: "stable/id with spaces", name: "Display Name" },
      { id: "Stable-ID-2", name: "Display Name" },
    ];
    const originalNodes = structuredClone(nodes);

    const slugs = buildCustomProviderDisplaySlugs(nodes);

    expect([...slugs.keys()]).toEqual(["stable/id with spaces", "Stable-ID-2"]);
    expect(nodes).toEqual(originalNodes);
  });
});
