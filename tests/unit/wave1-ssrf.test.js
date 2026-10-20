import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns", () => ({ default: { promises: { lookup } } }));
const { assertPublicUrlResolved, fetchPublic } = await import("../../src/shared/utils/ssrfGuard.js");
beforeEach(() => { lookup.mockReset(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("D fail-closed DNS deadline", () => {
  it("blocks resolution errors", async () => {
    lookup.mockRejectedValue(new Error("DNS failed"));
    await expect(assertPublicUrlResolved("https://fixture.example/")).rejects.toThrow(/Blocked URL/);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("blocks empty answers before fetch", async () => {
    lookup.mockResolvedValue([]);
    const fetch = vi.fn().mockResolvedValue(new Response("unsafe")); vi.stubGlobal("fetch", fetch);
    await expect(fetchPublic("https://fixture.example/")).rejects.toThrow(/Blocked URL/);
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("blocks a hung resolver within three seconds", async () => {
    lookup.mockReturnValue(new Promise(() => {}));
    let verdict = "pending";
    const pending = assertPublicUrlResolved("https://fixture.example/").then(() => { verdict = "allowed"; }, (error) => { verdict = error.message; });
    await vi.advanceTimersByTimeAsync(3000);
    expect(verdict).toMatch(/Blocked URL/);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("allows public DNS and clears its deadline", async () => {
    lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    await expect(assertPublicUrlResolved("https://fixture.example/")).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("literal public addresses bypass DNS", async () => {
    await expect(assertPublicUrlResolved("https://8.8.8.8/")).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });
  it("blocks a redirect with an empty DNS answer before following it", async () => {
    lookup.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }]).mockResolvedValueOnce([]);
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://empty.example/" } })).mockResolvedValueOnce(new Response("unsafe"));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchPublic("https://fixture.example/")).rejects.toThrow(/Blocked URL/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
