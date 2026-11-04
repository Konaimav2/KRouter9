import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { ROLE } from "../../open-sse/translator/schema/index.js";

// Prepared ordinary regressions: we feed raw upstream bytes and read raw
// client bytes; the real handler + stream code choose the terminal.
const effects = vi.hoisted(() => ({
  detail: vi.fn(async () => {}),
  usage: vi.fn(async () => {}),
  pending: vi.fn(),
  requestLog: vi.fn(async () => {}),
  fetch: vi.fn(async () => { throw new Error("premature-eof fixture forbids fetch"); }),
  adapter: vi.fn(() => { throw new Error("premature-eof fixture forbids database access"); }),
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
const { handleStreamingResponse } = await import("../../open-sse/handlers/chatCore/streamingHandler.js");
const { createStreamController } = await import("../../open-sse/utils/streamHandler.js");

const encoder = new TextEncoder();
let logsDir;
let loggerMod;

async function makeEnabledLogger() {
  vi.resetModules();
  const mod = await import("../../open-sse/utils/requestLogger.js");
  const logger = await mod.createRequestLogger(FORMATS.OPENAI, FORMATS.OPENAI, "deepseek-ai/DeepSeek-V4.1-Flash-1017");
  const spy = vi.fn();
  const orig = logger.logStreamTermination;
  logger.logStreamTermination = (...args) => { spy(...args); return orig(...args); };
  return { mod, logger, spy };
}

function ledgerLines() {
  const file = path.join(logsDir, "errors.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function parseFrames(text) {
  return text.replaceAll("\r\n", "\n").split("\n\n").flatMap((block) => {
    let event = null;
    const data = [];
    for (const line of block.split("\n")) {
      if (!line.trim()) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return [];
    const value = data.join("\n");
    return [{ event, data: value === "[DONE]" ? value : JSON.parse(value) }];
  });
}

async function runStream({ sourceFormat, targetFormat, model, reqLogger, upstreamStart }) {
  const log = Object.fromEntries(["info", "warn", "line", "errorLine"].map((n) => [n, vi.fn()]));
  const streamController = createStreamController({ provider: "deepseek", model, log });
  const upstream = new ReadableStream({ start: upstreamStart });
  const result = await handleStreamingResponse({
    providerResponse: new Response(upstream, { headers: { "content-type": "text/event-stream" } }),
    provider: "deepseek",
    model,
    sourceFormat,
    targetFormat,
    body: { model, stream: true, messages: [{ role: ROLE.USER, content: "fixture" }] },
    stream: true,
    requestStartTime: Date.now(),
    reqLogger: reqLogger || null,
    streamController,
    onStreamComplete: vi.fn(),
    streamDetailId: "premature-eof-detail",
    log,
  });
  expect(result.success).toBe(true);
  expect(result.response.ok).toBe(true);
  const reader = result.response.body.getReader();
  let total = "";
  for (let i = 0; i < 64; i++) {
    const { done, value } = await reader.read();
    if (done) break;
    total += new TextDecoder().decode(value, { stream: true });
  }
  total += new TextDecoder().decode();
  await loggerMod._flushLedger();
  return total;
}

function dataEvent(model, delta, finishReason = null, usage = null) {
  return `data: ${JSON.stringify({
    id: "chatcmpl-premature-eof",
    object: "chat.completion.chunk",
    created: 1,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason, matched_stop: null }],
    usage,
  })}\n\n`;
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "premature-eof-logs-"));
  vi.stubEnv("ENABLE_REQUEST_LOGS", "true");
  vi.stubEnv("REQUEST_LOG_DIR", logsDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (logsDir && fs.existsSync(logsDir)) fs.rmSync(logsDir, { recursive: true, force: true });
});

afterAll(() => vi.unstubAllGlobals());

describe("upstream EOF without a terminal (DeepSeek trace shape)", () => {
  it("passthrough openai client gets exactly one failure terminal + DONE and a ledger entry", async () => {
    const model = "deepseek-ai/DeepSeek-V4.1-Flash-1017";
    const enabled = await makeEnabledLogger();
    loggerMod = enabled.mod;
    const reqLogger = enabled.logger;
    const termSpy = enabled.spy;

    const text = await runStream({
      sourceFormat: FORMATS.OPENAI,
      targetFormat: FORMATS.OPENAI,
      model,
      reqLogger,
      upstreamStart: (c) => {
        // Mid-reasoning chunks, then a clean EOF — no finish_reason, no [DONE].
        c.enqueue(encoder.encode(dataEvent(model, { reasoning_content: "**phone**; move" })));
        c.enqueue(encoder.encode(dataEvent(model, { reasoning_content: ".\n\nLet me think" })));
        c.close();
      },
    });

    const frames = parseFrames(text);
    const failures = frames.filter((f) => f.data && typeof f.data === "object" && f.data.error);
    expect(failures, "one client-format failure terminal must close a premature EOF stream").toHaveLength(1);
    expect(failures[0].data.error.code).toBe("stream_disconnected");
    expect(failures[0].data.error.message).toContain("without a terminal event");
    // error frame must precede the [DONE] sentinel
    const errIdx = frames.findIndex((f) => f.data && typeof f.data === "object" && f.data.error);
    const doneIdx = frames.findIndex((f) => f.data === "[DONE]");
    expect(doneIdx).toBeGreaterThan(errIdx);
    expect(frames.filter((f) => f.data === "[DONE]")).toHaveLength(1);
    // partial content is preserved before the failure
    expect(text).toContain("**phone**; move");

    // termination logged exactly once, with stream stats
    expect(termSpy).toHaveBeenCalledTimes(1);
    expect(termSpy.mock.calls[0][0]).toMatchObject({
      reason: "upstream_eof_without_terminal",
      provider: "deepseek",
      model,
      sourceFormat: "openai",
      targetFormat: "openai",
    });
    expect(termSpy.mock.calls[0][0].bytes).toBeGreaterThan(0);
    expect(termSpy.mock.calls[0][0].chunks).toBeGreaterThanOrEqual(2);
    expect(termSpy.mock.calls[0][0].lastChunk).toContain("Let me think");

    // durable ledger line survives (outside the session dir)
    const term = ledgerLines().find((l) => l.reason === "upstream_eof_without_terminal");
    expect(term).toBeTruthy();
    expect(term.provider).toBe("deepseek");
    expect(term.model).toBe(model);
    expect(term.sessionDir).toBe(reqLogger.sessionPath);
    expect(term.bytes).toBeGreaterThan(0);
    expect(term.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("normal complete stream emits no failure terminal and no termination log", async () => {
    const model = "deepseek-ai/DeepSeek-V4.1-Flash-1017";
    const enabled = await makeEnabledLogger();
    loggerMod = enabled.mod;
    const text = await runStream({
      sourceFormat: FORMATS.OPENAI,
      targetFormat: FORMATS.OPENAI,
      model,
      reqLogger: enabled.logger,
      upstreamStart: (c) => {
        c.enqueue(encoder.encode(dataEvent(model, { content: "hello" })));
        c.enqueue(encoder.encode(dataEvent(model, {}, "stop", { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 })));
        c.enqueue(encoder.encode("data: [DONE]\n\n"));
        c.close();
      },
    });

    const frames = parseFrames(text);
    expect(frames.filter((f) => f.data && typeof f.data === "object" && f.data.error)).toEqual([]);
    expect(frames.filter((f) => f.data?.choices?.[0]?.finish_reason === "stop")).toHaveLength(1);
    // Exactly ONE [DONE]: the forwarded upstream sentinel must suppress the
    // flush-synthesized duplicate on normal OpenAI→OpenAI completion.
    expect(frames.filter((f) => f.data === "[DONE]")).toHaveLength(1);
    expect(enabled.spy, "logStreamTermination must not fire on normal completion").not.toHaveBeenCalled();
    expect(ledgerLines().filter((l) => l.reason === "upstream_eof_without_terminal")).toEqual([]);
  });

  it("translate mode (claude client, openai upstream) gets a claude error frame and a ledger entry", async () => {
    const model = "deepseek-ai/DeepSeek-V4.1-Flash-1017";
    const enabled = await makeEnabledLogger();
    loggerMod = enabled.mod;
    const text = await runStream({
      sourceFormat: FORMATS.CLAUDE,
      targetFormat: FORMATS.OPENAI,
      model,
      reqLogger: enabled.logger,
      upstreamStart: (c) => {
        c.enqueue(encoder.encode(dataEvent(model, { content: "hello from upstream" })));
        c.close(); // clean EOF, no finish chunk, no [DONE]
      },
    });

    const frames = parseFrames(text);
    expect(text).toContain("hello from upstream");
    const errorFrames = frames.filter((f) => f.event === "error");
    expect(errorFrames, "claude client must receive an event:error terminal").toHaveLength(1);
    expect(errorFrames[0].data.type).toBe("error");
    expect(frames.filter((f) => f.event === "message_stop")).toHaveLength(0);
    expect(enabled.spy).toHaveBeenCalledTimes(1);
    expect(enabled.spy.mock.calls[0][0].reason).toBe("upstream_eof_without_terminal");
    expect(ledgerLines().filter((l) => l.reason === "upstream_eof_without_terminal")).toHaveLength(1);
  });
});
