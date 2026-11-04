import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FORMATS } from "../../open-sse/translator/formats.js";

// Ledger durability + client-side termination logging. The real logger writes
// errors.jsonl; we only control how the stream ends.
const effects = vi.hoisted(() => ({
  detail: vi.fn(async () => {}),
  usage: vi.fn(async () => {}),
  pending: vi.fn(),
  requestLog: vi.fn(async () => {}),
  fetch: vi.fn(async () => { throw new Error("termination-ledger fixture forbids fetch"); }),
  adapter: vi.fn(() => { throw new Error("termination-ledger fixture forbids database access"); }),
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
let loggerMod;

async function makeEnabledLogger(model = "termination-ledger-model") {
  vi.resetModules();
  const mod = await import("../../open-sse/utils/requestLogger.js");
  const logger = await mod.createRequestLogger(FORMATS.OPENAI, FORMATS.OPENAI, model);
  return { mod, logger };
}

function ledgerLines() {
  const file = path.join(logsDir, "errors.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "termination-ledger-logs-"));
  vi.stubEnv("ENABLE_REQUEST_LOGS", "true");
  vi.stubEnv("REQUEST_LOG_DIR", logsDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (logsDir && fs.existsSync(logsDir)) fs.rmSync(logsDir, { recursive: true, force: true });
});

afterAll(() => vi.unstubAllGlobals());

describe("errors.jsonl durability", () => {
  it("logError writes the ledger even when the session dir no longer exists", async () => {
    const enabled = await makeEnabledLogger();
    loggerMod = enabled.mod;
    const { logger } = enabled;
    expect(logger.sessionPath).toBeTruthy();
    expect(fs.existsSync(logger.sessionPath)).toBe(true);

    // Simulate pruneLogSessions having removed the session directory.
    fs.rmSync(logger.sessionPath, { recursive: true, force: true });

    logger.logError(new Error("HTTP 403: Forbidden"), null, {
      reason: "HTTP_403",
      provider: "antigravity",
      model: "gemini-3.8-flash-high",
      sourceFormat: "openai",
      targetFormat: "antigravity",
      statusCode: 403,
      url: "https://example.invalid/v1/chat",
    });
    await loggerMod._flushLedger();

    const lines = ledgerLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      reason: "HTTP_403",
      provider: "antigravity",
      model: "gemini-3.8-flash-high",
      statusCode: 403,
      error: "HTTP 403: Forbidden",
    });
    expect(lines[0].url).toBe("https://example.invalid/v1/chat");
    // sessionDir still points at the (now gone) dir — the record survives the prune
    expect(fs.existsSync(lines[0].sessionDir)).toBe(false);
  });

  it("logStreamTermination writes the ledger even with no session dir", async () => {
    const enabled = await makeEnabledLogger("no-session-model");
    loggerMod = enabled.mod;
    const { logger } = enabled;
    fs.rmSync(logger.sessionPath, { recursive: true, force: true });

    logger.logStreamTermination({
      reason: "upstream_eof_without_terminal",
      provider: "openai",
      model: "no-session-model",
      sourceFormat: "openai",
      targetFormat: "openai",
      bytes: 1234,
      chunks: 7,
      durationMs: 55,
      lastChunk: "tail",
      error: "stream ended without finish_reason or [DONE]",
      stack: "",
    });
    await loggerMod._flushLedger();

    const lines = ledgerLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      reason: "upstream_eof_without_terminal",
      provider: "openai",
      model: "no-session-model",
      bytes: 1234,
      chunks: 7,
      durationMs: 55,
      lastChunk: "tail",
      ledgerType: "streamTermination",
    });
  });

  it("pruneLogSessions keeps errors.jsonl (it is a file, not a session dir)", async () => {
    const enabled = await makeEnabledLogger("prune-model");
    loggerMod = enabled.mod;
    const { logger } = enabled;
    logger.logError(new Error("boom"), null, { reason: "logError", provider: "p", model: "m" });
    await loggerMod._flushLedger();

    // Force a prune with a tiny budget over the (single) session dir.
    vi.stubEnv("REQUEST_LOG_PRUNE_INTERVAL_MS", "0");
    await enabled.mod.pruneLogSessions({ dir: logsDir, maxBytes: 1, retentionHours: 24, maxSessions: 10 });

    expect(fs.existsSync(path.join(logsDir, "errors.jsonl"))).toBe(true);
    expect(ledgerLines()).toHaveLength(1);
  });
});

describe("client-side stream termination logging", () => {
  it("records client_cancelled with chunk/byte stats when the client cancels mid-stream", async () => {
    const { pipeWithDisconnect, createStreamController } = await import("../../open-sse/utils/streamHandler.js");
    const enabled = await makeEnabledLogger("cancel-model");
    loggerMod = enabled.mod;
    const { logger, mod } = enabled;
    await mod._flushLedger();

    const log = Object.fromEntries(["info", "warn", "line", "errorLine"].map((n) => [n, vi.fn()]));
    const streamController = createStreamController({ provider: "deepseek", model: "cancel-model", log });

    const enc = new TextEncoder();
    let closeUpstream;
    const upstream = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode("data: {\"choices\":[{\"delta\":{\"content\":\"abc\"}}]}\n\n"));
        closeUpstream = () => { try { c.close(); } catch { /* */ } };
      },
    });
    const transformStream = new TransformStream(); // identity placeholder, not consumed
    const streamMeta = {
      provider: "deepseek",
      model: "cancel-model",
      sourceFormat: "openai",
      targetFormat: "openai",
      reqLogger: logger,
    };

    const out = pipeWithDisconnect(
      new Response(upstream, { headers: { "content-type": "text/event-stream" } }),
      transformStream,
      streamController,
      null,
      30000,
      streamMeta,
    );

    const reader = out.getReader();
    // Pull at most one chunk, then cancel like a client dropping the response.
    await reader.read().catch(() => {});
    await reader.cancel();

    // Let the async ledger write + any pending pipeline work settle.
    closeUpstream();
    await new Promise((r) => setTimeout(r, 25));
    await loggerMod._flushLedger();

    const cancels = ledgerLines().filter((l) => l.reason === "client_cancelled");
    expect(cancels, "client cancel mid-stream must be recorded once").toHaveLength(1);
    expect(cancels[0].provider).toBe("deepseek");
    expect(cancels[0].model).toBe("cancel-model");
    expect(cancels[0].bytes).toBeGreaterThan(0);
    expect(cancels[0].chunks).toBeGreaterThanOrEqual(1);
    expect(cancels[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records client_disconnected with byte stats when handleDisconnect fires", async () => {
    const { pipeWithDisconnect, createStreamController } = await import("../../open-sse/utils/streamHandler.js");
    const enabled = await makeEnabledLogger("discard-model");
    loggerMod = enabled.mod;
    const { logger, mod } = enabled;

    const log = Object.fromEntries(["info", "warn", "line", "errorLine"].map((n) => [n, vi.fn()]));
    const streamController = createStreamController({ provider: "deepseek", model: "discard-model", log });

    const enc = new TextEncoder();
    const upstream = new ReadableStream({
      start(c) { c.enqueue(enc.encode("data: {\"choices\":[{\"delta\":{\"content\":\"xy\"}}]}\n\n")); },
    });
    const transformStream = new TransformStream();
    const streamMeta = {
      provider: "deepseek",
      model: "discard-model",
      sourceFormat: "openai",
      targetFormat: "openai",
      reqLogger: logger,
    };

    const out = pipeWithDisconnect(new Response(upstream), transformStream, streamController, null, 30000, streamMeta);
    const reader = out.getReader();
    await reader.read().catch(() => {});

    // chatCore calls handleDisconnect("client_aborted") when the client aborts.
    streamController.handleDisconnect("client_aborted");
    await new Promise((r) => setTimeout(r, 25));
    await loggerMod._flushLedger();
    await reader.cancel().catch(() => {});

    const disc = ledgerLines().filter((l) => l.reason === "client_disconnected");
    expect(disc, "client disconnect must be recorded once").toHaveLength(1);
    expect(disc[0].provider).toBe("deepseek");
    expect(disc[0].bytes).toBeGreaterThan(0);
    expect(disc[0].chunks).toBeGreaterThanOrEqual(1);
  });
});
