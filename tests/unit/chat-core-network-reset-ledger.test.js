// Pre-header upstream network reset (executor throws before any response
// header): the request dir used to end with no 6_error.json and no errors.jsonl
// record ("executor threw before logTargetRequest could run"). Now the reset
// must land in the durable ledger via reqLogger.logError + logStreamTermination
// with provider, model, source/target format, code, endpoint index, duration,
// message and stack — while the error result stays a retryable 502 so the
// account/combo layer can fall back to the next target.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROLE } from "../../open-sse/translator/schema/index.js";
import { HTTP_STATUS } from "../../open-sse/config/runtimeConfig.js";

const effects = vi.hoisted(() => ({
  detail: vi.fn(async () => {}),
  usage: vi.fn(async () => {}),
  pending: vi.fn(),
  requestLog: vi.fn(async () => {}),
  fetch: vi.fn(async () => { throw new Error("network-reset fixture forbids fetch"); }),
  adapter: vi.fn(() => { throw new Error("network-reset fixture forbids database access"); }),
}));

vi.mock("@/lib/usageDb.js", () => ({
  saveRequestDetail: effects.detail,
  saveRequestUsage: effects.usage,
  trackPendingRequest: effects.pending,
  appendRequestLog: effects.requestLog,
}));
vi.mock("@/lib/db/driver.js", () => ({ getAdapter: effects.adapter }));
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  default: effects.fetch,
  proxyAwareFetch: effects.fetch,
}));

vi.stubGlobal("fetch", effects.fetch);
await import("../translator/registerAll.js");

let logsDir;

function ledgerLines() {
  const file = path.join(logsDir, "errors.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function undiciReset() {
  const outer = new TypeError("fetch failed");
  outer.cause = Object.assign(new Error("read ECONNRESET"), { code: "UND_ERR_SOCKET" });
  return outer;
}

function callHandleChatCore() {
  return import("../../open-sse/handlers/chatCore.js").then(({ handleChatCore }) => handleChatCore({
    body: { model: "deepseek/deepseek-chat", stream: true, messages: [{ role: ROLE.USER, content: "fixture" }] },
    modelInfo: { provider: "deepseek", model: "deepseek-chat" },
    credentials: { accessToken: "test-token" },
    log: Object.fromEntries(["info", "warn", "debug", "line", "errorLine", "tagForSession"].map((n) => [n, vi.fn()])),
    connectionId: "conn-reset-1",
  }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "network-reset-logs-"));
  vi.stubEnv("ENABLE_REQUEST_LOGS", "true");
  vi.stubEnv("REQUEST_LOG_DIR", logsDir);
  // Request logger reads the env when the module loads — load fresh per test.
  vi.resetModules();
  await import("../../open-sse/utils/requestLogger.js"); // warms the module under the stubbed env
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  if (logsDir && fs.existsSync(logsDir)) fs.rmSync(logsDir, { recursive: true, force: true });
});

afterAll(() => vi.unstubAllGlobals());

describe("pre-header upstream network reset in handleChatCore", () => {
  it("writes a durable upstream_network_reset record (logError + logStreamTermination) and stays a 502", async () => {
    effects.fetch.mockRejectedValue(undiciReset());
    const result = await callHandleChatCore();

    expect(result.success).toBe(false);
    expect(result.status).toBe(HTTP_STATUS.BAD_GATEWAY); // 502: account/combo fallback semantics unchanged
    expect(result.error).toContain("fetch failed");

    const loggerMod = await import("../../open-sse/utils/requestLogger.js");
    await loggerMod._flushLedger();

    const errLine = ledgerLines().find((l) => l.reason === "upstream_network_reset" && !l.ledgerType);
    const termLine = ledgerLines().find((l) => l.reason === "upstream_network_reset" && l.ledgerType === "streamTermination");
    expect(errLine, "logError ledger record").toBeTruthy();
    expect(errLine).toMatchObject({
      provider: "deepseek",
      model: "deepseek-chat",
      sourceFormat: "openai",
      targetFormat: "openai",
      statusCode: HTTP_STATUS.BAD_GATEWAY,
      code: "UND_ERR_SOCKET",
      urlIndex: 0,
    });
    expect(errLine.durationMs).toBeGreaterThanOrEqual(0);
    expect(errLine.error).toContain("fetch failed");
    expect(errLine.stack).toBeTruthy();
    expect(errLine.url).toContain("api.deepseek.com");
    expect(errLine.url).not.toContain("test-token");

    // The same request is already preserved as 1_req_client/2_req_source/4_req_target.
    // Do not duplicate a potentially multi-megabyte prompt/tool history into 6_error.json.
    const sessionError = JSON.parse(fs.readFileSync(path.join(errLine.sessionDir, "6_error.json"), "utf8"));
    expect(sessionError.requestBody).toBeNull();

    expect(termLine, "logStreamTermination ledger record").toBeTruthy();
    expect(termLine).toMatchObject({
      provider: "deepseek",
      model: "deepseek-chat",
      code: "UND_ERR_SOCKET",
      urlIndex: 0,
      bytes: 0,
    });
    expect(termLine.durationMs).toBeGreaterThanOrEqual(0);
    expect(termLine.error).toContain("fetch failed");

    // Session-local records exist so the request dir is no longer "no 6_error.json".
    expect(fs.existsSync(errLine.sessionDir)).toBe(true);
    expect(fs.existsSync(path.join(errLine.sessionDir, "6_error.json"))).toBe(true);
    expect(fs.existsSync(path.join(errLine.sessionDir, "6_stream_termination.json"))).toBe(true);
  }, 30000);

  it("a NON-reset thrown error (ENOTFOUND) does not write an upstream_network_reset record", async () => {
    effects.fetch.mockRejectedValue(new Error("getaddrinfo ENOTFOUND deepseek.example.com"));
    const result = await callHandleChatCore();

    expect(result.success).toBe(false);
    expect(result.status).toBe(HTTP_STATUS.BAD_GATEWAY);

    const loggerMod = await import("../../open-sse/utils/requestLogger.js");
    await loggerMod._flushLedger();
    expect(ledgerLines().filter((l) => l.reason === "upstream_network_reset")).toHaveLength(0);
  }, 30000);

  it("a client AbortError before headers stays a 499 and is never logged as a reset", async () => {
    effects.fetch.mockImplementationOnce(async () => {
      throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    });
    const result = await callHandleChatCore();

    expect(result.success).toBe(false);
    expect(result.status).toBe(499);

    const loggerMod = await import("../../open-sse/utils/requestLogger.js");
    await loggerMod._flushLedger();
    expect(ledgerLines().filter((l) => l.reason === "upstream_network_reset")).toHaveLength(0);
  });
});
