import { describe, it, expect } from "vitest";
import { memoryCap, memoryCapFrom } from "../../src/lib/memoryCaps.js";
import { CircuitBreaker } from "../../open-sse/utils/circuitBreaker.js";

// P3: memory caps are configurable with safe fallbacks and the circuit-breaker
// map is bounded.
describe("memory caps (P3)", () => {
  it("returns fallbacks when no env/settings", () => {
    expect(memoryCap("streamAccumulateCapBytes")).toBe(65536);
    expect(memoryCap("observabilityBodyCapBytes")).toBe(262144);
  });

  it("prefers settings value over env/fallback", () => {
    expect(memoryCapFrom({ streamAccumulateCapBytes: 123 }, "streamAccumulateCapBytes")).toBe(123);
  });

  it("ignores non-positive/malformed values", () => {
    expect(memoryCapFrom({ streamAccumulateCapBytes: -1 }, "streamAccumulateCapBytes")).toBe(65536);
    expect(memoryCapFrom({ streamAccumulateCapBytes: "x" }, "streamAccumulateCapBytes")).toBe(65536);
  });

  it("maps camelCase names to SCREAMING_SNAKE_CASE env vars", () => {
    const prev = process.env.STREAM_ACCUMULATE_CAP_BYTES;
    process.env.STREAM_ACCUMULATE_CAP_BYTES = "12345";
    try {
      expect(memoryCap("streamAccumulateCapBytes")).toBe(12345);
      expect(memoryCap("circuitBreakerMaxEntries")).toBe(5000);
    } finally {
      if (prev === undefined) delete process.env.STREAM_ACCUMULATE_CAP_BYTES;
      else process.env.STREAM_ACCUMULATE_CAP_BYTES = prev;
    }
  });
});

describe("circuit breaker bounded map (P3)", () => {
  it("caps entries and evicts oldest", () => {
    const prev = process.env.CIRCUIT_BREAKER_MAX_ENTRIES;
    process.env.CIRCUIT_BREAKER_MAX_ENTRIES = "100";
    try {
      const cb = new CircuitBreaker();
      for (let i = 0; i < 1000; i++) {
        cb.recordFailure(`p${i}/m`, new Error("boom"));
      }
      expect(cb.healthMap.size).toBeLessThanOrEqual(100);
    } finally {
      if (prev === undefined) delete process.env.CIRCUIT_BREAKER_MAX_ENTRIES;
      else process.env.CIRCUIT_BREAKER_MAX_ENTRIES = prev;
    }
  });

  it("still recovers a healthy provider after cooldown", () => {
    const cb = new CircuitBreaker(10);
    cb.recordFailure("a/b", new Error("boom"));
    expect(cb.isAvailable("a/b")).toBe(false);
    cb.recordSuccess("a/b");
    expect(cb.isAvailable("a/b")).toBe(true);
  });
});
