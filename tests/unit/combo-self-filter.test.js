import { describe, it, expect } from "vitest";
import { partitionComboMembers } from "open-sse/services/combo.js";

describe("partitionComboMembers (resolution-aware pre-filter)", () => {
  it("keeps provider-qualified members whose model shares the combo bare name", async () => {
    const members = ["cx/gpt-5.6-terra", "cca/gpt-5.6-terra", "oc/muse-spark-1.3-contributor-free"];
    const resolveInfo = async (m) => {
      if (m === "oc/muse-spark-1.3-contributor-free") return { provider: "opencode", model: m };
      return { provider: m.split("/")[0], model: m.split("/").slice(1).join("/") };
    };
    const { safe, self } = await partitionComboMembers(
      members, new Set(["gpt-5.6-terra"]), resolveInfo
    );
    expect(safe).toEqual(members);
    expect(self).toEqual([]);
  });

  it("drops members that truly resolve back to the combo path", async () => {
    const members = ["gpt-5.6-terra", "cx/gpt-5.6-terra"];
    const resolveInfo = async (m) =>
      m.includes("/") ? { provider: "cx", model: "gpt-5.6-terra" } : { provider: null, model: m };
    const { safe, self } = await partitionComboMembers(
      members, new Set(["gpt-5.6-terra"]), resolveInfo
    );
    expect(safe).toEqual(["cx/gpt-5.6-terra"]);
    expect(self).toEqual(["gpt-5.6-terra"]);
  });

  it("drops on resolver throw (fail-closed, P0a loop guard)", async () => {
    const { safe, self } = await partitionComboMembers(
      ["cx/gpt-5.6-terra"], new Set(["gpt-5.6-terra"]), async () => { throw new Error("db down"); }
    );
    expect(safe).toEqual([]);
    expect(self).toEqual(["cx/gpt-5.6-terra"]);
  });

  it("keeps non-matching tails without calling the resolver", async () => {
    let calls = 0;
    const { safe, self } = await partitionComboMembers(
      ["ag/claude-sonnet-4-6"], new Set(["gpt-5.6-terra"]), async (m) => { calls++; return { provider: "ag", model: m }; }
    );
    expect(safe).toEqual(["ag/claude-sonnet-4-6"]);
    expect(self).toEqual([]);
    expect(calls).toBe(0);
  });
});
