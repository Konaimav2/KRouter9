import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTimeout as deadlineTimeout, clearTimeout as clearDeadlineTimeout } from "node:timers";
import { randomUUID } from "node:crypto";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { ROLE, OPENAI_BLOCK, OPENAI_FINISH } from "../../open-sse/translator/schema/index.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";

// Recovered from the prior S2 patch; prepared ordinary regressions, NOT RUN.
// Persistence/logging/network boundaries are intercepted, never the subject.
const effects = vi.hoisted(() => ({
  detail: vi.fn(async () => {}),
  usage: vi.fn(async () => {}),
  pending: vi.fn(),
  requestLog: vi.fn(async () => {}),
  fetch: vi.fn(async () => { throw new Error("S2 fixture forbids fetch"); }),
  adapter: vi.fn(() => { throw new Error("S2 fixture forbids database access"); }),
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
const { handleComboChat, resetComboRotation } = await import("../../open-sse/services/combo.js");

const provider = Object.keys(PROVIDERS).find((id) => PROVIDERS[id].format === FORMATS.OPENAI);
const models = [`${provider}/s2-first`, `${provider}/s2-second`];
const encoder = new TextEncoder();
const resources = [];
let log;

function deadline(promise, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = deadlineTimeout(() => reject(new Error(`S2 bounded wait: ${label}`)), 1500);
    }),
  ]).finally(() => clearDeadlineTimeout(timer));
}

function source(chunks = [], holdOpen = false) {
  let controller;
  let index = 0;
  const cancel = vi.fn();
  const stream = new ReadableStream({
    start(value) { controller = value; },
    pull(value) {
      if (index < chunks.length) {
        const chunk = chunks[index++];
        value.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      } else if (!holdOpen) value.close();
    },
    cancel,
  }, { highWaterMark: 0 });
  const fixture = {
    stream,
    cancel,
    fail(error) { controller.error(error); },
    dispose() { try { controller.close(); } catch { /* already ended */ } },
  };
  resources.push(fixture);
  return fixture;
}

function openaiChunk(delta, finishReason = null) {
  return `data: ${JSON.stringify({
    id: "chatcmpl-s2-fixture",
    object: "chat.completion.chunk",
    created: 1,
    model: "s2-fixture",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

function options(fixture, model, comboName) {
  const streamController = createStreamController({ provider, model, log });
  resources.push({ dispose() { streamController.abort(); } });
  return {
    providerResponse: new Response(fixture.stream, { headers: { "content-type": "text/event-stream" } }),
    provider,
    model,
    sourceFormat: FORMATS.OPENAI,
    targetFormat: FORMATS.OPENAI,
    body: { model, stream: true, messages: [{ role: ROLE.USER, content: "fixture" }] },
    stream: true,
    requestStartTime: Date.now(),
    streamController,
    onStreamComplete: vi.fn(),
    streamDetailId: `${model}-detail`,
    comboName,
    log,
  };
}

async function combo(first, comboName) {
  resetComboRotation(comboName);
  const attempts = [];
  const memberResults = [];
  const response = await deadline(handleComboChat({
    body: { stream: true, messages: [] },
    models,
    comboName,
    comboStrategy: "fallback",
    autoSwitch: false,
    log,
    async handleSingleModel(_body, member) {
      attempts.push(member);
      const fixture = member === models[0] ? first : source([
        openaiChunk({ content: "s2 fallback accepted" }),
        openaiChunk({}, OPENAI_FINISH.STOP),
        "data: [DONE]\n\n",
      ]);
      const result = await handleStreamingResponse(options(fixture, member, comboName));
      memberResults.push(result);
      return result.response;
    },
  }), "combo result");
  return { response, attempts, memberResults };
}

function readerFor(response) {
  const reader = response.body.getReader();
  resources.push({
    async dispose() {
      await reader.cancel().catch(() => {});
      try { reader.releaseLock(); } catch { /* already released */ }
    },
  });
  return reader;
}

async function drain(reader, prefix = "") {
  const decoder = new TextDecoder();
  let text = prefix;
  for (let count = 0; count < 64; count++) {
    const { done, value } = await deadline(reader.read(), "client bytes");
    if (done) return text + decoder.decode();
    text += decoder.decode(value, { stream: true });
  }
  throw new Error("S2 fixture exceeded 64 client chunks");
}

// Client wire JSON parsing only; no copied precommit classification logic.
function payloads(text) {
  return text.split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("fetch", effects.fetch);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  log = Object.fromEntries(["info", "warn", "line", "errorLine"].map((name) => [name, vi.fn()]));
});

afterEach(async () => {
  try {
    for (const resource of resources.splice(0).reverse()) {
      await deadline(Promise.resolve().then(() => resource.dispose()), "fixture cleanup");
    }
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  }
  expect(effects.fetch.mock.calls.length, "no fixture may call fetch").toBe(0);
  expect(effects.adapter.mock.calls.length, "no fixture may access a database").toBe(0);
});
afterAll(() => vi.unstubAllGlobals());

describe("actual combo handler semantic commit", () => {
  const errorEvent = 'data: {"error":{"message":"s2 presemantic upstream failure","type":"server_error"}}\n\n';
  const split = "data: {".length;

  it.each([
    ["whole error (classifier control)", [errorEvent]],
    ["error split before its error key", [errorEvent.slice(0, split), errorEvent.slice(split)]],
    ["comment before error", [": s2 heartbeat\n\n", errorEvent]],
  ])("rejects %s before returning a successful combo response", async (label, chunks) => {
    const first = source(chunks);
    const result = await combo(first, `s2-precommit-${label}`);
    const reader = readerFor(result.response);
    expect(result.memberResults[0].success, "presemantic SSE failure must not commit HTTP200").toBe(false);
    expect(result.memberResults[0].response.ok).toBe(false);
    expect(result.attempts, "next eligible member must be tried exactly once").toEqual(models);
    expect(first.cancel, "abandoned upstream is cancelled exactly once").toHaveBeenCalledTimes(1);
    expect(first.stream.locked, "abandoned upstream reader must be released").toBe(false);
    expect(effects.detail.mock.calls.some(([detail]) => detail.id === `${models[0]}-detail` && detail.status === "success")).toBe(false);
    const output = payloads(await drain(reader));
    expect(output.map((item) => item.choices?.[0]?.delta?.content || "").join("")).toBe("s2 fallback accepted");
  });

  it("does not log or return malformed presemantic upstream data", async () => {
    const marker = `s2-opaque-${randomUUID().replaceAll("-", "")}`;
    const captured = [];
    console.log.mockImplementation((...args) => { captured.push(args); });
    const first = source([`data: {"opaque":"${marker}"\n\n`]);
    const result = await combo(first, "s2-malformed-precommit");
    const body = await result.memberResults[0].response.json();
    const loggedMarker = captured.some((args) => args.some((arg) => String(arg).includes(marker)));

    expect(loggedMarker, "presemantic malformed payload must not reach logs").toBe(false);
    expect(JSON.stringify(body).includes(marker), "client errors must not reflect malformed payload").toBe(false);
    expect(result.memberResults[0].success).toBe(false);
    expect(result.memberResults[0].response.ok).toBe(false);
    expect(result.attempts).toEqual(models);
    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(first.stream.locked).toBe(false);
    expect(effects.detail.mock.calls.some(([detail]) => detail.id === `${models[0]}-detail` && detail.status === "success")).toBe(false);
    const output = payloads(await drain(readerFor(result.response)));
    expect(output.map((item) => item.choices?.[0]?.delta?.content || "").join("")).toBe("s2 fallback accepted");
  });

  it("preserves split UTF-8 text and does not replay the first chunk", async () => {
    const content = "s2 界 boundary";
    const bytes = encoder.encode(openaiChunk({ content }));
    const splitAt = bytes.indexOf(0xe7) + 1; // Inside the three-byte character.
    expect(splitAt).toBeGreaterThan(1);
    const result = await combo(source([
      bytes.slice(0, splitAt), bytes.slice(splitAt),
      openaiChunk({}, OPENAI_FINISH.STOP), "data: [DONE]\n\n",
    ]), "s2-split-text");
    const output = payloads(await drain(readerFor(result.response)));
    expect(result.attempts).toEqual([models[0]]);
    expect(output.map((item) => item.choices?.[0]?.delta?.content || "").join("")).toBe(content);
  });

  it("accepts tool-only split arguments without fallback or duplicate tool bytes", async () => {
    const result = await combo(source([
      openaiChunk({ tool_calls: [{ index: 0, id: "call_s2_tool", type: OPENAI_BLOCK.FUNCTION, function: { name: "s2_tool", arguments: '{"count":' } }] }),
      openaiChunk({ tool_calls: [{ index: 0, function: { arguments: "1}" } }] }),
      openaiChunk({}, OPENAI_FINISH.TOOL_CALLS), "data: [DONE]\n\n",
    ]), "s2-tool-only");
    const output = payloads(await drain(readerFor(result.response)));
    const tools = output.flatMap((item) => item.choices?.[0]?.delta?.tool_calls || []);
    expect(result.attempts).toEqual([models[0]]);
    expect(tools.filter((tool) => tool.id).map((tool) => tool.id)).toEqual(["call_s2_tool"]);
    expect(tools.every((tool) => tool.index === 0)).toBe(true);
    expect(JSON.parse(tools.map((tool) => tool.function?.arguments || "").join(""))).toEqual({ count: 1 });
    expect(output.at(-1).choices[0].finish_reason).toBe(OPENAI_FINISH.TOOL_CALLS);
  });

  it("never replays a member after its semantic text reached the client", async () => {
    const first = source([openaiChunk({ content: "s2 visible once" })], true);
    const result = await combo(first, "s2-postcommit-abort");
    const reader = readerFor(result.response);
    const initial = await deadline(reader.read(), "first semantic client frame");
    expect(initial.done).toBe(false);
    const prefix = new TextDecoder().decode(initial.value);
    expect(payloads(prefix).some((item) => item.choices?.[0]?.delta?.content === "s2 visible once")).toBe(true);
    first.fail(new DOMException("s2 transport closed after text", "AbortError"));
    const output = payloads(await drain(reader, prefix));
    expect(result.attempts).toEqual([models[0]]);
    expect(output.map((item) => item.choices?.[0]?.delta?.content || "").join("")).toBe("s2 visible once");
  });
});
