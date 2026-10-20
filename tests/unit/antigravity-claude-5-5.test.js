import { createRequire } from "module";
import { expect, it } from "vitest";
import { getModelsByProviderId, getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { MITM_TOOLS } from "../../src/shared/constants/cliTools.js";
import * as quota from "../../src/sse/services/antigravityQuota.js";
const { MODEL_SYNONYMS, MODEL_PATTERNS } = createRequire(import.meta.url)("../../src/mitm/config.js");
it.each(["sonnet", "opus"])("routes %s tiers in engine and MITM", family => {
  const base = `claude-${family}-5-5`;
  const ids = getModelsByProviderId("ag").map(m => m.id);
  expect(ids).not.toContain(`${base}-thinking`);
  for (const tier of ["", "-low", "-medium", "-high"]) {
    const id = base + tier;
    const level = tier.slice(1) || "high";
    expect(ids).toContain(id);
    expect(getModelUpstreamId("ag", id)).toBe(`${base}-${level}(${level})`);
    expect(MITM_TOOLS.antigravity.modelAliases).toContain(id);
    expect(MITM_TOOLS.antigravity.defaultModels.find(m => m.id === id)?.alias).toBe(id);
    expect(MODEL_SYNONYMS.antigravity[id.replace("5-5", "5.5")]).toBe(id);
    expect(MODEL_PATTERNS.antigravity.find(p => p.match.test(id.replace("5-5", "5.5")))?.alias).toBe(id);
  }
});
it.each([409, 429])("parses exact reset HTTP %s", status => {
  const resetAt = new Date(Date.now() + 600000).toISOString();
  expect(new AntigravityExecutor().parseError({ status, headers: new Headers() }, JSON.stringify({ error: { message: "quota", details: [{ metadata: { quotaResetTimeStamp: resetAt } }] } }))).toMatchObject({ status, message: "quota", resetsAtMs: Date.parse(resetAt) });
});
it("parses RetryInfo", () => {
  const now = Date.now();
  const out = new AntigravityExecutor().parseError({ status: 429, headers: new Headers() }, JSON.stringify({ error: { details: [{ retryDelay: "12.5s" }] } }));
  expect(out.resetsAtMs).toBeGreaterThanOrEqual(now + 12500);
  expect(out.resetsAtMs).toBeLessThanOrEqual(Date.now() + 12500);
});
it("falls back safely for malformed quota errors", () => {
  const executor = new AntigravityExecutor();
  expect(executor.parseError({ status: 429, headers: new Headers() }, "not JSON")).toMatchObject({ status: 429 });
  expect(executor.parseError({ status: 429, headers: new Headers() }, JSON.stringify({ error: { message: "quota", details: [{ retryDelay: "-1s" }] } }))).toMatchObject({ status: 429 });
});
it("uses tier aliases and latest exhausted reset without crossing families", () => {
  const soon = new Date(Date.now() + 60000).toISOString();
  const later = new Date(Date.now() + 120000).toISOString();
  const quotas = { "claude-sonnet-5-5-high": { remainingPercentage: 80 }, claude_gpt_session: { remainingPercentage: 0, resetAt: soon }, claude_gpt_weekly: { remainingPercentage: 0, resetAt: later }, gemini_session: { remainingPercentage: 60 } };
  expect(quota.getAntigravityModelQuota(quotas, "ag/claude-sonnet-5-5(high)")).toMatchObject({ remainingPercentage: 0, resetAt: later });
  expect(quota.getAntigravityModelQuota(quotas, "gemini-4-argon-high")).toEqual({ remainingPercentage: 60 });
  expect(quota.getAntigravityModelQuota(quotas, "gemini-image")).toBeNull();
  expect(quota.getAntigravityModelQuota({ "claude-opus-5-5-high": { remainingPercentage: 30 } }, "claude-opus-5-5")).toEqual({ remainingPercentage: 30 });
});
it("ignores expired exhausted buckets when a live family bucket still constrains the model", () => {
  const expired = new Date(Date.now() - 60000).toISOString();
  const resetAt = new Date(Date.now() + 60000).toISOString();
  const quotas = {
    "claude-sonnet-5-5-high": { remainingPercentage: 0, resetAt: expired },
    claude_gpt_weekly: { remainingPercentage: 20, resetAt },
  };
  expect(quota.getAntigravityModelQuota(quotas, "claude-sonnet-5-5")).toEqual(quotas.claude_gpt_weekly);
});
