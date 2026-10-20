import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { BEDROCK } from "../../open-sse/config/awsConstants.js";
import { getProviderModels } from "../../open-sse/config/providerModels.js";
import { getExecutor, hasSpecializedExecutor } from "../../open-sse/executors/index.js";
import { getModelInfoCore } from "../../open-sse/services/model.js";
import { encodeEventFrame } from "../../open-sse/utils/awsEventStream.js";

const MODEL = "us.anthropic.claude-sonnet-4-20250514-v1:0";
const XAI_MODEL = "us.xai.grok-4.6";
const CREDS = {
  apiKey: "test-secret",
  providerSpecificData: { accessKeyId: "AKIATEST", region: "eu-central-1", sessionToken: "test-token" },
};
const frame = (event) => encodeEventFrame(
  { ":message-type": "event", ":event-type": BEDROCK.chunkEventName },
  { bytes: Buffer.from(JSON.stringify(event)).toString("base64") },
);
const streamOf = (...chunks) => new ReadableStream({ start(c) { chunks.forEach(x => c.enqueue(x)); c.close(); } });
const read = stream => new Response(stream).text();
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Bedrock discovery", () => {
  it.each([["bedrock", "br", "claude"], ["bedrock-xai", "brx", "openai"]])("registers %s with models and executor", (id, alias, format) => {
    expect(Array.isArray(REGISTRY)).toBe(true);
    expect(REGISTRY.filter(p => p.id === id)).toHaveLength(1);
    expect(PROVIDERS[id]?.format).toBe(format);
    expect(getProviderModels(alias).length).toBeGreaterThan(0);
    for (const name of [id, alias]) {
      expect(hasSpecializedExecutor(name)).toBe(true);
      expect(getExecutor(name).constructor.name).toBe("BedrockExecutor");
    }
  });
  it.each([["br", "bedrock", MODEL], ["aws-bedrock", "bedrock", MODEL], ["brx", "bedrock-xai", XAI_MODEL], ["bedrock-grok", "bedrock-xai", XAI_MODEL]])("resolves %s aliases", async (alias, provider, model) => {
    expect(await getModelInfoCore(`${alias}/${model}`, {})).toEqual({ provider, model });
  });
  it.each([[MODEL, "bedrock"], ["global.anthropic.claude-sonnet-5", "bedrock"], [XAI_MODEL, "bedrock-xai"], ["global.xai.grok-4.6", "bedrock-xai"]])("infers the right wire for bare %s", async (model, provider) => {
    expect(await getModelInfoCore(model, {})).toEqual({ provider, model });
  });
  it("projects AWS credential capabilities into dashboard constants", async () => {
    const { APIKEY_PROVIDERS } = await import("@/shared/constants/providers.js");
    for (const id of ["bedrock", "bedrock-xai"]) {
      expect(APIKEY_PROVIDERS[id]?.credentialForm).toBe("aws");
      expect(APIKEY_PROVIDERS[id]?.apiKeyOptionalWith).toBe("profile");
    }
  });
});

describe("Bedrock request shaping", () => {
  it("escapes the model and chooses streaming versus invoke", () => {
    const executor = getExecutor("bedrock");
    expect(executor.buildUrl(MODEL, true, 0, CREDS)).toBe(`https://bedrock-runtime.eu-central-1.amazonaws.com/model/${encodeURIComponent(MODEL)}/invoke-with-response-stream`);
    expect(executor.buildUrl(MODEL, false, 0, CREDS)).toMatch(/\/invoke$/);
  });
  it("rejects region-based origin injection", () => {
    expect(() => getExecutor("bedrock").buildUrl(MODEL, true, 0, { providerSpecificData: { region: "evil.com/x" } })).toThrow(/Invalid AWS region/);
  });
  it("uses the environment region and then the default", () => {
    vi.stubEnv("AWS_REGION", "ap-northeast-1");
    expect(getExecutor("bedrock").buildUrl(MODEL, false, 0, {})).toContain("ap-northeast-1.amazonaws.com");
    vi.stubEnv("AWS_REGION", ""); vi.stubEnv("AWS_DEFAULT_REGION", "");
    expect(getExecutor("bedrock").buildUrl(MODEL, false, 0, {})).toContain(`${BEDROCK.defaultRegion}.amazonaws.com`);
  });
  it("pins the Anthropic version without mutating the request", () => {
    const body = { model: MODEL, stream: true, anthropic_version: "client-version", messages: [], max_tokens: 12 };
    expect(getExecutor("bedrock").transformRequest(MODEL, body, true, CREDS)).toEqual({ anthropic_version: BEDROCK.anthropicVersion, messages: [], max_tokens: 12 });
    expect(body.model).toBe(MODEL);
  });
  it("does not add Anthropic fields on the xAI wire", () => {
    expect(getExecutor("bedrock-xai").transformRequest(XAI_MODEL, { model: XAI_MODEL, stream: true, messages: [], max_tokens: 2000 }, true, CREDS)).toEqual({ messages: [], max_tokens: 2000 });
  });
  it.each([["bedrock", XAI_MODEL], ["bedrock-xai", MODEL], ["bedrock", "amazon.nova-pro-v1:0"]])("rejects incompatible models on %s", (id, model) => {
    expect(() => getExecutor(id).buildUrl(model, true, 0, CREDS)).toThrow(/not supported/);
  });
  it("signs the actual POST, refuses redirects, and redacts only logged credentials", async () => {
    proxyAwareFetch.mockResolvedValue(new Response('{"content":[]}'));
    const result = await getExecutor("bedrock").execute({ model: MODEL, body: { model: MODEL, messages: [], max_tokens: 8 }, stream: false, credentials: CREDS });
    const [url, request] = proxyAwareFetch.mock.calls[0];
    expect(url).toContain("eu-central-1.amazonaws.com");
    expect(request.redirect).toBe("error");
    expect(request.method).toBe("POST");
    expect(request.headers.Authorization).toMatch(/AWS4-HMAC-SHA256.*Signature=[a-f0-9]{64}/);
    expect(request.headers["x-amz-security-token"]).toBe("test-token");
    expect(result.headers.Authorization).toContain("Signature=<redacted>");
    expect(result.headers["x-amz-security-token"]).toBe("<redacted>");
    expect(JSON.parse(request.body)).toEqual(result.transformedBody);
    expect(await result.response.json()).toEqual({ content: [] });
  });
  it("leaves upstream JSON errors intact", async () => {
    proxyAwareFetch.mockResolvedValue(new Response('{"message":"denied"}', { status: 403 }));
    const result = await getExecutor("bedrock").execute({ model: MODEL, body: {}, stream: true, credentials: CREDS });
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({ message: "denied" });
  });
  it("wraps successful streaming HTTP responses as SSE", async () => {
    proxyAwareFetch.mockResolvedValue(new Response(streamOf(frame({ type: "message_stop" }))));
    const result = await getExecutor("bedrock").execute({ model: MODEL, body: {}, stream: true, credentials: CREDS });
    expect(result.response.headers.get("content-type")).toContain("text/event-stream");
    expect(await result.response.text()).toContain("event: message_stop");
  });
  it("propagates caller cancellation and clears the connection timer", async () => {
    vi.useFakeTimers();
    const ctrl = new AbortController();
    const error = new Error("client cancelled");
    proxyAwareFetch.mockImplementation(async (_url, request) => {
      ctrl.abort(error);
      request.signal.throwIfAborted();
    });
    await expect(getExecutor("bedrock").execute({ model: MODEL, body: {}, stream: false, credentials: CREDS, signal: ctrl.signal })).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds connection setup time", async () => {
    vi.useFakeTimers();
    proxyAwareFetch.mockImplementation((_url, request) => new Promise((_resolve, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true })));
    const result = getExecutor("bedrock").execute({ model: MODEL, body: {}, stream: false, credentials: CREDS });
    const assertion = expect(result).rejects.toThrow("Bedrock fetch connect timeout");
    await vi.runAllTimersAsync();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Bedrock credential probe", () => {
  it.each([[200, null, true], [403, BEDROCK.accessDeniedErrorType, true], [403, "UnrecognizedClientException", false]])("handles HTTP %s / %s", async (status, errorType, valid) => {
    const { probeBedrockCredentials } = await import("../../open-sse/executors/bedrock.js");
    const fetch = vi.fn().mockResolvedValue(new Response('{"message":"rejected"}', { status, headers: errorType ? { [BEDROCK.errorTypeHeader]: errorType } : {} }));
    const result = await probeBedrockCredentials(CREDS, fetch);
    expect(result.valid).toBe(valid);
    if (!valid) expect(result.error).toContain("UnrecognizedClientException");
    expect(fetch.mock.calls[0][1].redirect).toBe("error");
    expect(fetch.mock.calls[0][1].headers.Authorization).toContain("AWS4-HMAC-SHA256");
  });
  it("rejects invalid credentials without contacting AWS", async () => {
    const { probeBedrockCredentials } = await import("../../open-sse/executors/bedrock.js");
    const fetch = vi.fn();
    expect((await probeBedrockCredentials({ providerSpecificData: { region: "evil.com/x" } }, fetch)).valid).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("times out the signed probe and releases its timer", async () => {
    vi.useFakeTimers();
    const { probeBedrockCredentials } = await import("../../open-sse/executors/bedrock.js");
    const fetch = vi.fn((_url, request) => new Promise((_resolve, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true })));
    const result = probeBedrockCredentials(CREDS, fetch);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ valid: false, error: "AWS credential probe timed out" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Bedrock EventStream framing", () => {
  it.each([
    ["bedrock", {}, "no type"],
    ["bedrock-xai", { id: "missing-choices" }, "choices"],
  ])("rejects malformed inner events on %s", async (id, event, message) => {
    expect(await read(getExecutor(id).eventStreamToSse(streamOf(frame(event))))).toContain(message);
  });
  it("reports missing bytes and malformed JSON", async () => {
    for (const payload of [{}, { bytes: Buffer.from("{bad-json").toString("base64") }]) {
      const bytes = encodeEventFrame({ ":message-type": "event", ":event-type": BEDROCK.chunkEventName }, payload);
      expect(await read(getExecutor("bedrock").eventStreamToSse(streamOf(bytes)))).toContain("event: error");
    }
  });
  it("warns on unknown metadata without losing the terminal event", async () => {
    const log = { warn: vi.fn(), error: vi.fn() };
    const metadata = encodeEventFrame({ ":message-type": "event", ":event-type": "metadata" }, {});
    const sse = await read(getExecutor("bedrock").eventStreamToSse(streamOf(metadata, frame({ type: "message_stop" })), log));
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.error).not.toHaveBeenCalled();
    expect(sse).toContain("message_stop");
  });
  it("surfaces upstream read errors and unlocks the body", async () => {
    const upstream = new ReadableStream({ pull(c) { c.error(new Error("upstream disconnected")); } });
    const sse = await read(getExecutor("bedrock").eventStreamToSse(upstream));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sse).toContain("upstream disconnected");
    expect(upstream.locked).toBe(false);
  });
  it("reassembles partial frames and emits Claude events", async () => {
    const bytes = frame({ type: "content_block_delta", delta: { text: "hello" } });
    const sse = await read(getExecutor("bedrock").eventStreamToSse(streamOf(bytes.slice(0, 7), bytes.slice(7), frame({ type: "message_stop" }))));
    expect(sse).toContain('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"hello"}}');
    expect(sse).toContain("event: message_stop");
    expect(sse).not.toContain("event: error");
  });
  it("emits OpenAI chunks and exactly one DONE sentinel", async () => {
    const sse = await read(getExecutor("bedrock-xai").eventStreamToSse(streamOf(frame({ choices: [{ delta: { content: "GROK" }, finish_reason: null }] }), frame({ choices: [{ delta: {}, finish_reason: "stop" }] }))));
    expect(sse).toContain('"content":"GROK"');
    expect(sse).not.toContain("event:");
    expect(sse.match(/data: \[DONE\]/g)).toHaveLength(1);
    expect(sse).not.toContain('"error"');
  });
  it.each([["bedrock", { type: "message_start" }, "message_stop"], ["bedrock-xai", { choices: [] }, "finish_reason"]])("reports truncated %s streams", async (id, event, message) => {
    const sse = await read(getExecutor(id).eventStreamToSse(streamOf(frame(event))));
    expect(sse).toContain(message);
    expect(sse).toContain('"error"');
    expect(sse).not.toContain("[DONE]");
  });
  it.each(["prelude", "message", "partial"]) ("rejects %s corruption", async (kind) => {
    let bytes = frame({ type: "message_stop" });
    if (kind === "prelude") bytes[8] ^= 0xff;
    if (kind === "message") bytes[bytes.length - 1] ^= 0xff;
    if (kind === "partial") bytes = bytes.slice(0, -1);
    const sse = await read(getExecutor("bedrock").eventStreamToSse(streamOf(bytes)));
    expect(sse.match(/^event: error$/gm)).toHaveLength(1);
    expect(sse).toContain(kind === "partial" ? "mid-frame" : "CRC mismatch");
  });
  it("surfaces in-band exceptions and releases the open upstream", async () => {
    const cancel = vi.fn();
    const upstream = new ReadableStream({ start(c) { c.enqueue(encodeEventFrame({ ":message-type": "exception", ":exception-type": "throttlingException" }, { message: "slow down" })); }, cancel });
    const sse = await read(getExecutor("bedrock").eventStreamToSse(upstream));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sse).toContain("throttlingException");
    expect(cancel).toHaveBeenCalledOnce();
    expect(upstream.locked).toBe(false);
  });
  it("treats downstream cancellation as normal and releases the upstream", async () => {
    const cancel = vi.fn(), log = { error: vi.fn() };
    const upstream = new ReadableStream({ start(c) { c.enqueue(frame({ type: "message_start" })); }, cancel });
    const reader = getExecutor("bedrock").eventStreamToSse(upstream, log).getReader();
    await reader.read(); await reader.cancel("client disconnected");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(cancel).toHaveBeenCalledOnce();
    expect(log.error).not.toHaveBeenCalled();
    expect(upstream.locked).toBe(false);
  });
});
