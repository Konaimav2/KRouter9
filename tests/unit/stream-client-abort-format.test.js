import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTimeout as deadlineTimeout, clearTimeout as clearDeadlineTimeout } from "node:timers";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { ROLE, CLAUDE_BLOCK, OPENAI_FINISH, CLAUDE_STOP } from "../../open-sse/translator/schema/index.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";

// Prepared ordinary regressions: NOT RUN. No callback injection or mocked
// transforms/controller: abort bytes must be selected by the actual handler.
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

const encoder = new TextEncoder();
const semantic = "s2 crossformat semantic";
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

// Wire parser only: it does not reproduce the handler's terminal-selection code.
function frames(text) {
  return text.replaceAll("\r\n", "\n").split("\n\n").flatMap((block) => {
    let event = null;
    const data = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return [];
    const value = data.join("\n");
    return [{ event, data: value === "[DONE]" ? value : JSON.parse(value) }];
  });
}

function textOf(frame) {
  return frame.data?.choices?.[0]?.delta?.content
    || frame.data?.delta?.text
    || (frame.event === "response.output_text.delta" ? frame.data.delta : "")
    || "";
}

function openaiEvent(delta, finishReason = null) {
  return `data: ${JSON.stringify({
    id: "chatcmpl-s2-format-fixture",
    object: "chat.completion.chunk",
    created: 1,
    model: "s2-format-fixture",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...(finishReason ? { usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } } : {}),
  })}\n\n`;
}

function namedEvent(type, data) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

function upstreamBytes(format) {
  if (format === FORMATS.CLAUDE) {
    return {
      initial: namedEvent("message_start", { message: { id: "msg_s2_fixture", model: "s2-format-fixture", role: ROLE.ASSISTANT, content: [], usage: { input_tokens: 2, output_tokens: 0 } } })
        + namedEvent("content_block_start", { index: 0, content_block: { type: CLAUDE_BLOCK.TEXT, text: "" } })
        + namedEvent("content_block_delta", { index: 0, delta: { type: "text_delta", text: semantic } }),
      terminal: namedEvent("content_block_stop", { index: 0 })
        + namedEvent("message_delta", { delta: { stop_reason: CLAUDE_STOP.END_TURN }, usage: { output_tokens: 1 } })
        + namedEvent("message_stop", {}),
    };
  }
  if (format === FORMATS.OPENAI_RESPONSES) {
    return {
      initial: namedEvent("response.created", { response: { id: "resp_s2_fixture", status: "in_progress" } })
        + namedEvent("response.output_text.delta", { delta: semantic }),
      terminal: namedEvent("response.completed", { response: { id: "resp_s2_fixture", status: "completed", usage: { input_tokens: 2, output_tokens: 1 } } })
        + "data: [DONE]\n\n",
    };
  }
  return {
    initial: openaiEvent({ role: ROLE.ASSISTANT, content: semantic }),
    terminal: openaiEvent({}, OPENAI_FINISH.STOP) + "data: [DONE]\n\n",
  };
}

async function clientStream(sourceFormat, targetFormat) {
  const provider = Object.keys(PROVIDERS).find((id) => PROVIDERS[id].format === targetFormat);
  expect(provider, "fixture must use a configured upstream format").toBeTruthy();
  const bytes = upstreamBytes(targetFormat);
  let upstreamController;
  const cancel = vi.fn();
  const upstream = new ReadableStream({
    start(controller) {
      upstreamController = controller;
      controller.enqueue(encoder.encode(bytes.initial));
    },
    cancel,
  });
  const streamController = createStreamController({ provider, model: "s2-format-fixture", log });
  resources.push({
    dispose() {
      try { upstreamController.close(); } catch { /* aborted/closed */ }
      streamController.abort();
    },
  });
  const result = await deadline(handleStreamingResponse({
    providerResponse: new Response(upstream, { headers: { "content-type": "text/event-stream" } }),
    provider,
    model: "s2-format-fixture",
    sourceFormat,
    targetFormat,
    body: { model: "s2-format-fixture", stream: true, messages: [{ role: ROLE.USER, content: "fixture" }] },
    stream: true,
    requestStartTime: Date.now(),
    streamController,
    onStreamComplete: vi.fn(),
    streamDetailId: "s2-format-detail",
    log,
  }), "streaming handler");
  expect(result.success).toBe(true);
  expect(result.response.ok).toBe(true);
  const reader = result.response.body.getReader();
  resources.push({
    async dispose() {
      await reader.cancel().catch(() => {});
      try { reader.releaseLock(); } catch { /* already released */ }
    },
  });
  return {
    reader,
    abort() { upstreamController.error(new DOMException("s2 native transport abort", "AbortError")); },
    complete() {
      upstreamController.enqueue(encoder.encode(bytes.terminal));
      upstreamController.close();
    },
  };
}

async function readSemantic(reader) {
  const decoder = new TextDecoder();
  let text = "";
  for (let count = 0; count < 16; count++) {
    const { done, value } = await deadline(reader.read(), "translated semantic frame");
    expect(done, "upstream stays open until the client receives semantic output").toBe(false);
    text += decoder.decode(value, { stream: true });
    if (frames(text).some((frame) => textOf(frame) === semantic)) return text;
  }
  throw new Error("S2 registration/fixture failed to emit a semantic client frame");
}

async function drain(reader, prefix) {
  const decoder = new TextDecoder();
  let text = prefix;
  for (let count = 0; count < 64; count++) {
    const { done, value } = await deadline(reader.read(), "terminal client bytes");
    if (done) return frames(text + decoder.decode());
    text += decoder.decode(value, { stream: true });
  }
  throw new Error("S2 fixture exceeded 64 terminal chunks");
}

function failureFrames(output) {
  return output.filter((frame) => frame.data?.error || frame.data?.response?.status === "failed");
}

function assertClientFraming(output, sourceFormat) {
  const dataFrames = output.filter((frame) => frame.data !== "[DONE]");
  if (sourceFormat === FORMATS.OPENAI) {
    expect(dataFrames.every((frame) => frame.event === null), "OpenAI client must not receive Claude/Responses event names").toBe(true);
    expect(dataFrames.every((frame) => frame.data.type !== "error" && !frame.data.type?.startsWith("response."))).toBe(true);
  } else if (sourceFormat === FORMATS.CLAUDE) {
    expect(dataFrames.every((frame) => frame.event && !frame.event.startsWith("response."))).toBe(true);
    expect(dataFrames.every((frame) => !frame.data.choices), "Claude client must not receive OpenAI chunks").toBe(true);
  } else {
    expect(dataFrames.every((frame) => frame.event?.startsWith("response.")), "Responses client must not receive chat/Claude frames").toBe(true);
  }
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

describe("actual streaming handler selects the client abort protocol", () => {
  it.each([
    [FORMATS.OPENAI, FORMATS.CLAUDE],
    [FORMATS.CLAUDE, FORMATS.OPENAI],
    [FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES],
    [FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI],
  ])("client %s / upstream %s receives exactly its own abort terminal", async (sourceFormat, targetFormat) => {
    const client = await clientStream(sourceFormat, targetFormat);
    const prefix = await readSemantic(client.reader);
    assertClientFraming(frames(prefix), sourceFormat); // Nonidentity translation must really occur.
    client.abort(); // Not until semantic bytes have reached the client.
    const output = await drain(client.reader, prefix);
    const failures = failureFrames(output);
    expect(failures, "one client-format failure must terminate a transport abort").toHaveLength(1);
    if (sourceFormat === FORMATS.CLAUDE) {
      expect(failures[0]).toMatchObject({ event: "error", data: { type: "error", error: { type: "api_error" } } });
    } else if (sourceFormat === FORMATS.OPENAI_RESPONSES) {
      expect(failures[0]).toMatchObject({ event: "response.failed", data: { type: "response.failed", response: { status: "failed" } } });
    } else {
      expect(failures[0]).toMatchObject({ event: null, data: { error: { type: "server_error", code: "stream_disconnected" } } });
    }
    assertClientFraming(output, sourceFormat);
    expect(output.filter((frame) => frame.data === "[DONE]")).toHaveLength(sourceFormat === FORMATS.CLAUDE ? 0 : 1);
    expect(output.map(textOf).join("")).toBe(semantic);
  });

  it.each([
    [FORMATS.OPENAI, FORMATS.CLAUDE],
    [FORMATS.CLAUDE, FORMATS.OPENAI],
  ])("normal client %s / upstream %s completion does not synthesize failure", async (sourceFormat, targetFormat) => {
    const client = await clientStream(sourceFormat, targetFormat);
    const prefix = await readSemantic(client.reader);
    client.complete();
    const output = await drain(client.reader, prefix);
    assertClientFraming(output, sourceFormat);
    expect(failureFrames(output)).toEqual([]);
    expect(output.filter((frame) => frame.data === "[DONE]").length).toBeLessThanOrEqual(1);
    expect(output.map(textOf).join("")).toBe(semantic);
    if (sourceFormat === FORMATS.CLAUDE) {
      expect(output.filter((frame) => frame.event === "message_stop")).toHaveLength(1);
    } else {
      expect(output.filter((frame) => frame.data?.choices?.[0]?.finish_reason === OPENAI_FINISH.STOP)).toHaveLength(1);
    }
  });
});
