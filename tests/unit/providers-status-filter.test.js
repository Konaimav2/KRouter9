import { describe, expect, it } from "vitest";
import {
  STATUS_FILTER_OPTIONS,
  getConnectionStatus,
  matchesStatusFilter,
} from "@/app/(dashboard)/dashboard/providers/utils.js";

describe("providers status filter", () => {
  it("exposes all/active/inactive/none options", () => {
    expect(STATUS_FILTER_OPTIONS.map((o) => o.value)).toEqual([
      "all",
      "active",
      "inactive",
      "none",
    ]);
  });

  it("classifies a provider with no connections as none", () => {
    expect(getConnectionStatus({ total: 0, allDisabled: false })).toBe("none");
  });

  it("classifies a provider whose only connections are disabled as inactive", () => {
    expect(getConnectionStatus({ total: 2, allDisabled: true })).toBe(
      "inactive",
    );
  });

  it("classifies a provider with at least one enabled connection as active", () => {
    expect(getConnectionStatus({ total: 1, allDisabled: false })).toBe(
      "active",
    );
  });

  it("treats noAuth providers as active even with no stored connection", () => {
    expect(getConnectionStatus({ total: 0, allDisabled: false }, true)).toBe(
      "active",
    );
  });

  it("matchesStatusFilter always passes for 'all'", () => {
    expect(matchesStatusFilter("all", { total: 0, allDisabled: false })).toBe(
      true,
    );
  });

  it("matchesStatusFilter compares against the derived status", () => {
    const disabledStats = { total: 3, allDisabled: true };
    expect(matchesStatusFilter("inactive", disabledStats)).toBe(true);
    expect(matchesStatusFilter("active", disabledStats)).toBe(false);
    expect(matchesStatusFilter("none", disabledStats)).toBe(false);
  });

  it("aliases the Connected tile id to the active vocabulary", () => {
    const activeStats = { total: 1, allDisabled: false };
    expect(matchesStatusFilter("connected", activeStats)).toBe(true);
    expect(matchesStatusFilter("connected", { total: 0 })).toBe(false);
  });

  it("aliases the Disabled tile id to the inactive vocabulary", () => {
    const disabledStats = { total: 3, allDisabled: true };
    expect(matchesStatusFilter("disabled", disabledStats)).toBe(true);
    expect(matchesStatusFilter("disabled", { total: 1, allDisabled: false })).toBe(
      false,
    );
  });

  it("keeps select and tile vocabularies in sync over the same provider set", () => {
    const providers = [
      { stats: { total: 1, allDisabled: false }, isNoAuth: false },
      { stats: { total: 2, allDisabled: true }, isNoAuth: false },
      { stats: { total: 0, allDisabled: false }, isNoAuth: false },
    ];
    const count = (value) =>
      providers.filter((p) => matchesStatusFilter(value, p.stats, p.isNoAuth))
        .length;
    expect(count("connected")).toBe(count("active"));
    expect(count("disabled")).toBe(count("inactive"));
    expect(count("connected")).toBe(1);
    expect(count("disabled")).toBe(1);
  });
});
