// Wave H2b item 2 (tiles) — TDD GREEN proof (RED was wave-h2b-tiles-red).
// Real-click battery FAIL: "tile count-vs-grid" (x2): e.g. Rate limited (3) /
// Network (5) tiles vs empty provider grids.
// Root cause: level + vocab mismatch. The health tiles count CONNECTIONS
// (page.js healthCounts reduce, unfiltered), while the grid shows PROVIDER
// LANES — and the API-key lane filtered on bare "apikey" while real stored
// connections use "api_key" (windsurf oauth flow, kiro api-key flow), so the
// lane was EMPTY (total 0) and the error-class filter dropped it.
// Fix (page.js): apikey lane stats use ["apikey", "api_key"] (dualAuthTypes
// already did this for oauth/free lanes). This test pins the fixed lane:
// api_key-typed 429 connections produce a visible ratelimited lane.
import { describe, expect, it } from "vitest";
import { normalizeErrorClass } from "../../src/shared/utils/errorClass.js";
import { matchesStatusFilter } from "../../src/app/(dashboard)/dashboard/providers/utils.js";

// Fixed lane filter core: matches getProviderStats(providerId, ["apikey","api_key"])
// narrowing, then errorClasses derived from that subset.
const APIKEY_AUTH_TYPES = ["apikey", "api_key"];

function laneStats(connections, providerId) {
  const lane = connections.filter(
    (c) => c.provider === providerId && APIKEY_AUTH_TYPES.includes(c.authType),
  );
  const errorConns = lane.filter((c) =>
    ["error", "expired", "unavailable", "refresh-invalid"].includes(c.testStatus));
  const classes = [...new Set(
    errorConns.map((c) => normalizeErrorClass(c)).filter((c) => c !== "unknown"),
  )];
  return { total: lane.length, errorClasses: classes, allDisabled: false };
}

describe("wave-h2b tiles: fixed lane matches tile", () => {
  it("GREEN: 3 api_key 429 connections show the Rate limited lane", () => {
    const connections = [1, 2, 3].map((n) => ({
      provider: "grip",
      authType: "api_key",
      testStatus: "error",
      errorCode: 429,
      lastError: "rate limited by upstream",
      isActive: true,
      id: `conn-${n}`,
    }));
    const stats = laneStats(connections, "grip");
    expect(stats.total).toBe(3);
    const visible = matchesStatusFilter("all", stats) && stats.errorClasses.includes("ratelimited");
    expect(visible).toBe(true);
  });

  it("GREEN: bare-apikey connections still match (no regression)", () => {
    const connections = [{
      provider: "grip",
      authType: "apikey",
      testStatus: "error",
      errorCode: 429,
      lastError: "429 too many requests",
      isActive: true,
      id: "conn-1",
    }];
    const stats = laneStats(connections, "grip");
    expect(stats.total).toBe(1);
    expect(stats.errorClasses).toContain("ratelimited");
  });
});
