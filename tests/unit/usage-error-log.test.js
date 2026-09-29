import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({ saveRequestUsage: vi.fn(async () => {}) }));

vi.mock("@/lib/usageDb.js", () => ({
  saveRequestUsage: mocks.saveRequestUsage,
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => ({})),
  getRequestDetails: vi.fn(async () => []),
  getRequestDetailById: vi.fn(async () => null),
}));

const { saveRequestError } = await import("open-sse/handlers/chatCore/requestDetail.js");

describe("saveRequestError (W03 failed requests reach the log)", () => {
  it("persists numeric status with zero tokens", async () => {
    await saveRequestError({
      provider: "codex",
      model: "gpt-5.6-sol",
      status: 400,
      error: "not supported",
      connectionId: "c1",
      endpoint: "/v1/chat/completions",
    });
    expect(mocks.saveRequestUsage).toHaveBeenCalledTimes(1);
    const entry = mocks.saveRequestUsage.mock.calls[0][0];
    expect(entry.status).toBe(400);
    expect(entry.provider).toBe("codex");
    expect(entry.model).toBe("gpt-5.6-sol");
  });

  it("does nothing without provider and model", async () => {
    await saveRequestError({ status: 500 });
    expect(mocks.saveRequestUsage).not.toHaveBeenCalled();
  });
});
