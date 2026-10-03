// U3b (F09 + F10) — TDD RED-first.
// F09: request-details rows derive statusCode (numeric), masked apiKey identity,
//      error excerpt; fail-open on old rows; error rows included; NEVER raw key.
// F10: per-key usage aggregation (by key, requests/tokens/cost) + sorting.
import { describe, it, expect } from "vitest";
import {
  deriveListFields,
  aggregatePerKey,
  sortPerKeyRows,
  maskAccount,
  maskKeyRef,
  errorExcerptOf,
} from "@/app/(dashboard)/dashboard/usage/components/usageMeta.js";

const RAW = "sk-test-0123456789abcdef";

describe("F09 deriveListFields — status/apiKey/error columns", () => {
  it("derives numeric code from response.status", () => {
    const out = deriveListFields(
      { status: "error", response: { error: "boom", status: 502 } },
      {}
    );
    expect(out.statusCode).toBe(502);
  });

  it("prefers top-level statusCode over response.status", () => {
    const out = deriveListFields(
      { status: "error", statusCode: 429, response: { error: "x", status: 500 } },
      {}
    );
    expect(out.statusCode).toBe(429);
  });

  it("masks apiKey and resolves keyName, NEVER leaks raw key", () => {
    const out = deriveListFields(
      { status: "success", apiKey: RAW },
      { [RAW]: { name: "ci-key" } }
    );
    expect(out.apiKeyMasked).toBe("sk-test-***");
    expect(out.keyName).toBe("ci-key");
    expect(JSON.stringify(out)).not.toContain(RAW);
  });

  it("falls back to masked key when name unknown", () => {
    const out = deriveListFields({ status: "success", apiKey: RAW }, {});
    expect(out.apiKeyMasked).toBe("sk-test-***");
    expect(out.keyName).toBe("sk-test-***");
    expect(JSON.stringify(out)).not.toContain(RAW);
  });

  it("extracts error excerpt from string and object shapes", () => {
    expect(
      deriveListFields({ status: "error", response: { error: "boom happened" } }, {}).errorExcerpt
    ).toBe("boom happened");
    expect(
      deriveListFields({ status: "error", response: { error: { message: "obj boom" } } }, {}).errorExcerpt
    ).toBe("obj boom");
    expect(
      deriveListFields({ status: "error", error: "top boom" }, {}).errorExcerpt
    ).toBe("top boom");
  });

  it("fail-open on sparse old rows", () => {
    const out = deriveListFields({ id: "sparse-1" }, {});
    expect(out.statusCode).toBeNull();
    expect(out.apiKeyMasked).toBeNull();
    expect(out.keyName).toBe("Local (No API Key)");
    expect(out.errorExcerpt).toBeNull();
  });

  it("rejects non-numeric status and sentinel keys", () => {
    expect(deriveListFields({ statusCode: "bogus" }, {}).statusCode).toBeNull();
    const out = deriveListFields({ apiKey: "local-no-key" }, {});
    expect(out.apiKeyMasked).toBeNull();
    expect(out.keyName).toBe("Local (No API Key)");
  });

  it("truncates long error excerpts", () => {
    const long = "e".repeat(500);
    const out = deriveListFields({ response: { error: long } }, {});
    expect(out.errorExcerpt.length).toBeLessThanOrEqual(160);
    expect(out.errorExcerpt.length).toBeGreaterThan(0);
  });
});

describe("F09 helpers — maskKeyRef / errorExcerptOf / maskAccount", () => {
  it("maskKeyRef follows usageRepo rule", () => {
    expect(maskKeyRef(RAW)).toBe("sk-test-***");
    expect(maskKeyRef("short")).toBe("s***");
    expect(maskKeyRef(null)).toBeNull();
    expect(maskKeyRef("")).toBeNull();
  });

  it("errorExcerptOf reads message objects, clamps length", () => {
    expect(errorExcerptOf("plain")).toBe("plain");
    expect(errorExcerptOf({ message: "m" })).toBe("m");
    expect(errorExcerptOf({})).toBeNull();
    expect(errorExcerptOf(null)).toBeNull();
    expect(errorExcerptOf("x".repeat(400)).length).toBeLessThanOrEqual(160);
  });

  it("maskAccount censors emails, passes through names", () => {
    expect(maskAccount("test@example.com")).toBe("t***@e***.com");
    expect(maskAccount("ci-key")).toBe("ci-key");
    expect(maskAccount("")).toBe("");
  });
});

describe("F10 aggregatePerKey — one row per key", () => {
  const byApiKey = {
    "sk-test-***|gpt-4|openai": {
      requests: 2, promptTokens: 100, completionTokens: 20, cachedTokens: 10,
      cost: 0.5, rawModel: "gpt-4", provider: "openai",
      apiKeyMasked: "sk-test-***", keyName: "ci-key", lastUsed: "2026-10-01T00:00:00Z",
    },
    "sk-test-***|claude|anthropic": {
      requests: 3, promptTokens: 50, completionTokens: 5, cachedTokens: 0,
      cost: 0.25, rawModel: "claude", provider: "anthropic",
      apiKeyMasked: "sk-test-***", keyName: "ci-key", lastUsed: "2026-10-02T00:00:00Z",
    },
    "local-no-key": {
      requests: 1, promptTokens: 10, completionTokens: 1, cachedTokens: 0,
      cost: 0, rawModel: "m", provider: "p",
      apiKeyMasked: null, keyName: "Local (No API Key)", lastUsed: "2026-10-01T00:00:00Z",
    },
  };

  it("groups model-split entries into per-key rows with summed metrics", () => {
    const rows = aggregatePerKey(byApiKey);
    expect(rows).toHaveLength(2);
    const ci = rows.find((r) => r.keyName === "ci-key");
    expect(ci.requests).toBe(5);
    expect(ci.promptTokens).toBe(150);
    expect(ci.completionTokens).toBe(25);
    expect(ci.cachedTokens).toBe(10);
    expect(ci.totalTokens).toBe(175);
    expect(ci.cost).toBeCloseTo(0.75);
    expect(ci.lastUsed).toBe("2026-10-02T00:00:00Z");
    expect(ci.apiKeyMasked).toBe("sk-test-***");
  });

  it("empty input → empty rows", () => {
    expect(aggregatePerKey({})).toEqual([]);
    expect(aggregatePerKey(null)).toEqual([]);
  });
});

describe("F10 sortPerKeyRows — sortable columns", () => {
  const rows = [
    { keyName: "b-key", requests: 1, totalTokens: 50, cost: 0.1, lastUsed: "2026-10-01T00:00:00Z" },
    { keyName: "a-key", requests: 9, totalTokens: 10, cost: 0.9, lastUsed: "2026-10-03T00:00:00Z" },
  ];

  it("sorts numeric desc/asc", () => {
    expect(sortPerKeyRows(rows, "requests", "desc")[0].keyName).toBe("a-key");
    expect(sortPerKeyRows(rows, "requests", "asc")[0].keyName).toBe("b-key");
    expect(sortPerKeyRows(rows, "cost", "desc")[0].keyName).toBe("a-key");
    expect(sortPerKeyRows(rows, "totalTokens", "asc")[0].keyName).toBe("a-key");
  });

  it("sorts keyName case-insensitively", () => {
    expect(sortPerKeyRows(rows, "keyName", "asc")[0].keyName).toBe("a-key");
    expect(sortPerKeyRows(rows, "keyName", "desc")[0].keyName).toBe("b-key");
  });
});
