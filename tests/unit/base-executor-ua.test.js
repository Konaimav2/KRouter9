import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => fetchMock(...args),
}));

const { BaseExecutor } = await import("../../open-sse/executors/base.js");

function res(status) {
  return { status, headers: { get: () => "" } };
}

beforeEach(() => fetchMock.mockReset());

describe("BaseExecutor headers — per-connection UA spoof (W04)", () => {
  it("sends psd.userAgent as User-Agent (AgentRouter-style spoof)", async () => {
    const ex = new BaseExecutor("test", { baseUrl: "https://x/api" });
    fetchMock.mockResolvedValue(res(200));
    await ex.execute({
      model: "m",
      body: {},
      stream: false,
      credentials: { apiKey: "k", providerSpecificData: { userAgent: "opencode/1.18.30" } },
    });
    const headers = fetchMock.mock.calls[0][1]?.headers || fetchMock.mock.calls[0][0]?.headers;
    const ua = headers?.["User-Agent"] || (typeof headers?.get === "function" && headers.get("User-Agent"));
    expect(ua).toBe("opencode/1.18.30");
  });

  it("sends no custom UA without psd.userAgent (upstream gates like AgentRouter require the spoof)", async () => {
    const ex = new BaseExecutor("test", { baseUrl: "https://x/api" });
    fetchMock.mockResolvedValue(res(200));
    await ex.execute({ model: "m", body: {}, stream: false, credentials: { apiKey: "k" } });
    const headers = fetchMock.mock.calls[0][1]?.headers || fetchMock.mock.calls[0][0]?.headers;
    const ua = headers?.["User-Agent"] || (typeof headers?.get === "function" && headers.get("User-Agent"));
    expect(!ua).toBe(true);
  });
});
