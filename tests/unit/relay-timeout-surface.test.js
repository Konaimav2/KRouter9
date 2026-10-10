// Wave E2 (RED): relay-timeout surfacing + W16F relay-URL log mask.
// A Vercel-relay FUNCTION_INVOCATION_TIMEOUT must surface as a retry-safe 504
// that never leaks the relay URL, and the relay URL must never hit logs raw.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseUpstreamError } from "../../open-sse/utils/error.js";
import { ERROR_RULES } from "../../open-sse/config/errorConfig.js";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";

const RELAY_HOST = "my-relay-abc123.vercel.app";
const RELAY_URL = `https://${RELAY_HOST}`;

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
}));

vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: () => ({
    noAuth: true,
    execute: executeMock,
  }),
}));

vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: async () => ({
    logClientRawRequest: vi.fn(),
    logRawRequest: vi.fn(),
    logTargetRequest: vi.fn(),
    logProviderResponse: vi.fn(),
    logConvertedResponse: vi.fn(),
    logError: vi.fn(),
  }),
}));

vi.mock("../../open-sse/utils/stream.js", () => ({
  COLORS: { red: "", reset: "" },
  createPassthroughStreamWithLogger: vi.fn(() => new TransformStream()),
}));

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
}));

const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");

function baseArgs(log, executeBehavior) {
  executeMock.mockReset();
  if (executeBehavior === "timeout-throw") {
    executeMock.mockRejectedValueOnce(
      Object.assign(
        new Error(
          `fetch failed: Upstream request to ${RELAY_URL} timed out after 60s (FUNCTION_INVOCATION_TIMEOUT)`
        ),
        { code: "UND_ERR_CONNECT_TIMEOUT" }
      )
    );
  }
  return {
    body: { model: "gpt-4o", stream: false, messages: [{ role: "user", content: "hello" }] },
    modelInfo: { provider: "openai", model: "gpt-4o" },
    credentials: {
      apiKey: "test-key",
      providerSpecificData: { vercelRelayUrl: RELAY_URL },
    },
    log,
    connectionId: "test-conn",
    rtkEnabled: false,
    cavemanEnabled: false,
    ponytailEnabled: false,
    clientRawRequest: {
      endpoint: "/v1/chat/completions",
      body: {},
      headers: { accept: "application/json" },
    },
  };
}

describe("relay timeout throw surfaces as retry-safe 504", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps a relay-timeout executor throw to 504, never 502", async () => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), line: vi.fn(), errorLine: vi.fn() };
    const result = await handleChatCore(baseArgs(log, "timeout-throw"));
    expect(result.status).toBe(504);
  });

  it("keeps the relay URL out of the client-facing timeout message", async () => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), line: vi.fn(), errorLine: vi.fn() };
    const result = await handleChatCore(baseArgs(log, "timeout-throw"));
    expect(result.error).not.toContain(RELAY_HOST);
    expect(result.error).not.toContain("vercel.app");
    expect(result.error).toMatch(/timed out|timeout|retry/i);
  });

  it("masks the relay URL on the chatCore PROXY log line (W16F)", async () => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), line: vi.fn(), errorLine: vi.fn() };
    await handleChatCore(baseArgs(log, "timeout-throw"));
    const logs = JSON.stringify(log.info.mock.calls);
    expect(logs).not.toContain(RELAY_HOST);
  });
});

describe("parseUpstreamError timeout branch", () => {
  it("normalizes a FUNCTION_INVOCATION_TIMEOUT body to 504 without the relay URL", async () => {
    const res = new Response(
      `Edge: FUNCTION_INVOCATION_TIMEOUT while fetching ${RELAY_URL}/v1/chat/completions`,
      { status: 500 }
    );
    const d = await parseUpstreamError(res);
    expect(d.statusCode).toBe(504);
    expect(d.message).not.toContain(RELAY_HOST);
  });

  it("normalizes a gateway-timeout body to a retry-safe message", async () => {
    const res = new Response("Gateway Timeout: upstream timed out", { status: 504 });
    const d = await parseUpstreamError(res);
    expect(d.statusCode).toBe(504);
    expect(d.message).toMatch(/timed out|timeout|retry/i);
    expect(d.message).not.toContain(RELAY_HOST);
  });
});

describe("ERROR_RULES timeout short-cooldown", () => {
  it("registers exactly one timeout text rule with the short cooldown", () => {
    const timeoutRules = ERROR_RULES.filter(
      (r) => typeof r.text === "string" && /timeout|timed.?out/i.test(r.text)
    );
    expect(timeoutRules).toHaveLength(1);
    expect(timeoutRules[0].cooldownMs).toBe(5 * 1000);
  });

  it("checkFallbackError cools a relay timeout down briefly and still falls back", () => {
    const r = checkFallbackError(504, "Upstream relay timed out (gateway timeout)");
    expect(r.shouldFallback).toBe(true);
    expect(r.cooldownMs).toBe(5 * 1000);
  });
});
