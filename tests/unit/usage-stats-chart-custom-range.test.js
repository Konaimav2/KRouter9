import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  getUsageStats: vi.fn(async () => ({ ok: true })),
  getChartData: vi.fn(async () => ({ ok: true })),
}));

import { getUsageStats, getChartData } from "@/lib/usageDb.js";
import { GET as statsGET } from "@/app/api/usage/stats/route.js";
import { GET as chartGET } from "@/app/api/usage/chart/route.js";

const START = "2026-08-01T00:00:00.000Z";
const END = "2026-08-15T00:00:00.000Z";

function req(path) {
  return { url: `http://localhost${path}` };
}

describe("usage stats/chart custom date params", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stats accepts startDate/endDate and forwards them", async () => {
    const res = await statsGET(req(`/api/usage/stats?startDate=${START}&endDate=${END}`));
    expect(res.status).toBe(200);
    expect(getUsageStats).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: START, endDate: END })
    );
  });

  it("chart accepts startDate/endDate and forwards them", async () => {
    const res = await chartGET(req(`/api/usage/chart?startDate=${START}&endDate=${END}`));
    expect(res.status).toBe(200);
    expect(getChartData).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: START, endDate: END })
    );
  });

  it("stats rejects invalid range with 400", async () => {
    const res = await statsGET(req("/api/usage/stats?startDate=not-a-date&endDate=" + END));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("chart rejects invalid range with 400", async () => {
    const res = await chartGET(req("/api/usage/chart?startDate=not-a-date&endDate=" + END));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("chart symmetry: accepts what stats accepts", async () => {
    const q = `?startDate=${START}&endDate=${END}`;
    const s = await statsGET(req("/api/usage/stats" + q));
    const c = await chartGET(req("/api/usage/chart" + q));
    expect(s.status).toBe(200);
    expect(c.status).toBe(200);
  });

  it("period presets still work without dates", async () => {
    const s = await statsGET(req("/api/usage/stats?period=7d"));
    const c = await chartGET(req("/api/usage/chart?period=7d"));
    expect(s.status).toBe(200);
    expect(c.status).toBe(200);
  });
});
