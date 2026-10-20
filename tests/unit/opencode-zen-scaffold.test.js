import { describe, expect, it, vi } from "vitest";
import registry from "../../open-sse/providers/registry/index.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";
import * as helpers from "../../open-sse/providers/models/helpers.js";

const loadExecutor = () => import("../../open-sse/executors/opencode-zen.js");
const createExecutor = async () => new (await loadExecutor()).OpenCodeZenExecutor();
const MODEL = "muse-spark-1.3-contributor-free";
const SESSION_RE = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;
const REQUEST_RE = /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/;

describe("OpenCode Zen additive scaffold", () => {
  it("appends one keyed Zen definition without replacing the free or Go lanes", () => {
    expect(Array.isArray(registry)).toBe(true);
    const entries = registry.filter((p) => p.id === "opencode-zen");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ category: "apikey", alias: "ocz", passthroughModels: true });
    expect(entries[0].noAuth).not.toBe(true);
    expect(registry.find((p) => p.id === "opencode").category).toBe("free");
    expect(registry.find((p) => p.id === "opencode-go").category).toBe("apikey");
    expect(PROVIDERS["opencode-zen"].baseUrl).toBe("https://opencode.ai/zen/v1/chat/completions");
  });

  it("exposes all three keyed native transports and endpoint-specific model metadata", async () => {
    const { default: provider } = await import("../../open-sse/providers/registry/opencode-zen.js");
    expect(provider.transports.map((t) => [t.format, t.baseUrl])).toEqual([
      ["openai", "https://opencode.ai/zen/v1/chat/completions"],
      ["claude", "https://opencode.ai/zen/v1/messages"],
      ["openai-responses", "https://opencode.ai/zen/v1/responses"],
    ]);
    expect(provider.transports.every((t) => t.auth.combined)).toBe(true);
    expect(provider.models.find((m) => m.id === MODEL)).toMatchObject({
      targetFormat: "openai-responses", supportedFormats: ["openai-responses"],
    });
    expect(provider.models.find((m) => m.id === "claude-opus-4-6").supportedFormats).toEqual(["claude"]);
    expect(provider.features).toMatchObject({ usage: true, usageApikey: true });
  });

  it.each([
    ["deepseek-v4-flash-free", true],
    ["ocz/muse-spark-1.3-contributor-free(high)", true],
    ["  mimo-v2.5-FREE  ", true],
    ["big-pickle", false],
    ["deepseek-v4-flash", false],
    [null, false],
    [42, false],
  ])("classifies free-tier model %s as %s", (model, free) => {
    expect(helpers.isOpencodeFreeTierModel).toBeTypeOf("function");
    expect(helpers.isOpencodeFreeTierModel(model)).toBe(free);
  });

  it("routes Muse Spark to Responses even with a stale transport", async () => {
    const executor = await createExecutor();
    expect(executor).toBeInstanceOf(DefaultExecutor);
    expect(executor.provider).toBe("opencode-zen");
    expect(executor.buildUrl(`${MODEL}(high)`, true, 0, {
      runtimeTransport: { baseUrl: "https://opencode.ai/zen/v1/messages" },
    })).toBe("https://opencode.ai/zen/v1/responses");
    expect(executor.buildUrl("deepseek-v4-pro")).toBe("https://opencode.ai/zen/v1/chat/completions");
    expect(executor.buildUrl("claude-opus-4-6", true, 0, {
      runtimeTransport: { baseUrl: "https://opencode.ai/zen/v1/messages" },
    })).toBe("https://opencode.ai/zen/v1/messages");
  });

  it("generates CLI-shaped IDs with a small counter and stable translated sessions", async () => {
    const { generateSessionId, generateRequestId, translateSessionId } = await loadExecutor();
    const timestamp = 1792400000000;
    const session = generateSessionId(timestamp);
    const request = generateRequestId(timestamp);
    expect(session).toMatch(SESSION_RE);
    expect(request).toMatch(REQUEST_RE);
    expect((~BigInt(`0x${session.slice(4, 16)}`)) & 0xfffn).toBe(1n);
    expect(BigInt(`0x${request.slice(4, 16)}`) & 0xfffn).toBe(1n);
    expect(translateSessionId("thread-1", "client")).toMatch(SESSION_RE);
    expect(translateSessionId("thread-1", "client")).toBe(translateSessionId("thread-1", "client"));
    expect(translateSessionId("thread-1", "other")).not.toBe(translateSessionId("thread-1", "client"));
    expect(translateSessionId(` ${session} `)).toBe(session);
  });

  it("preserves native session headers and does not mutate source credentials", async () => {
    const executor = await createExecutor();
    const { generateSessionId } = await loadExecutor();
    const session = generateSessionId();
    const credentials = { apiKey: "test-key", rawHeaders: { "X-OpenCode-Session": session } };
    const prepared = executor.prepareRequestCredentials({ credentials, providerSessionId: "fallback" });
    expect(prepared._opencodeZenSession).toBe(session);
    expect(credentials._opencodeZenSession).toBeUndefined();
    const translated = executor.prepareRequestCredentials({
      credentials: { rawHeaders: { "x-opencode-session": "invalid-native" } }, providerSessionId: "thread",
    });
    expect(translated._opencodeZenSession).toMatch(SESSION_RE);
  });

  it("retains paid API-key auth and valid native client identity", async () => {
    const executor = await createExecutor();
    const headers = executor.buildHeaders({ apiKey: "test-paid", rawHeaders: {
      "User-Agent": "opencode/1.18.40", "X-OpenCode-Client": "cli", "x-opencode-project": "project",
    } }, true, undefined, "deepseek-v4-pro");
    expect(headers.Authorization).toBe("Bearer test-paid");
    expect(headers["User-Agent"]).toBe("opencode/1.18.40");
    expect(headers["x-opencode-client"]).toBe("cli");
    expect(headers["x-opencode-project"]).toBe("project");
    expect(headers["x-opencode-session"]).toMatch(SESSION_RE);
    expect(headers["x-opencode-request"]).toBeUndefined();
  });

  it("uses public auth and request attestation only for free-tier models", async () => {
    const executor = await createExecutor();
    const headers = executor.buildHeaders({ apiKey: "test-paid", rawHeaders: {
      "user-agent": "opencode/1.16.0",
    } }, true, undefined, MODEL);
    expect(headers.Authorization).toBe("Bearer public");
    expect(headers["User-Agent"]).toBe("opencode/1.18.31");
    expect(headers["x-opencode-client"]).toBe("desktop");
    expect(headers["x-opencode-request"]).toMatch(REQUEST_RE);
  });

  it("forces streaming and appends missing chat fingerprint tools without duplicating existing tools", async () => {
    const executor = await createExecutor();
    const bash = { type: "function", function: { name: "bash", parameters: { type: "object" } } };
    const out = executor.transformRequest("deepseek-v4-flash-free", {
      messages: [{ role: "user", content: "hello" }], stream: false, tools: [bash],
    });
    expect(out.stream).toBe(true);
    expect(out.tools.map((t) => t.function.name)).toEqual(["bash", "glob", "grep", "read"]);
    expect(out.tools[0]).toBe(bash);
    expect(executor.transformRequest("deepseek-v4-flash-free", out).tools).toHaveLength(4);
  });

  it("sanitizes Responses history, caps, reasoning and flat tool schemas", async () => {
    const executor = await createExecutor();
    const out = executor.transformRequest(MODEL, {
      input: [
        { type: "reasoning", encrypted_content: "stale" },
        { type: "function_call", name: " read ", call_id: "x".repeat(90), arguments: { path: "a" }, encrypted_content: "stale" },
        { type: "function_call", name: " ", call_id: "bad" },
        { type: "function_call_output", call_id: "x".repeat(90), output: { ok: true }, reasoning_encrypted_content: "stale" },
      ],
      tools: [{ type: "function", function: { name: "read", parameters: { type: "object" } } }, { type: "web_search" }],
      tool_choice: { type: "function", name: "missing" }, max_tokens: 2048, reasoning_effort: "high",
    });
    expect(out).toMatchObject({ stream: true, store: false, max_output_tokens: 2048, reasoning: { effort: "high", summary: "auto" } });
    expect(out.max_tokens).toBeUndefined();
    expect(out.reasoning_effort).toBeUndefined();
    expect(out.tool_choice).toBeUndefined();
    expect(out.tools.map((t) => t.name)).toEqual(["read", "bash", "glob", "grep"]);
    expect(out.tools[0].parameters).toEqual({ type: "object", properties: {} });
    expect(out.input).toHaveLength(2);
    expect(out.input[0]).toMatchObject({ name: "read", arguments: '{"path":"a"}' });
    expect(out.input[0].call_id).toHaveLength(64);
    expect(out.input[1].output).toBe('{"ok":true}');
    expect(out.input.every((i) => !i.encrypted_content && !i.reasoning_encrypted_content)).toBe(true);
  });

  it("normalizes a string Responses prompt and supplies an empty-input fallback", async () => {
    const executor = await createExecutor();
    const text = executor.transformRequest(MODEL, { input: "hello", max_completion_tokens: 12 });
    expect(text.input[0].content[0].text).toBe("hello");
    expect(text.max_output_tokens).toBe(12);
    expect(text.max_completion_tokens).toBeUndefined();
    expect(executor.transformRequest(MODEL, { input: [] }).input[0].content[0].text).toBe("...");
  });

  it("prepares session credentials before delegating execution", async () => {
    const executor = await createExecutor();
    const result = { response: "synthetic" };
    const delegate = vi.spyOn(DefaultExecutor.prototype, "execute").mockResolvedValue(result);
    try {
      const args = { model: MODEL, body: { input: "hello" }, credentials: { apiKey: "test-paid" }, providerSessionId: "thread" };
      expect(await executor.execute(args)).toBe(result);
      expect(delegate).toHaveBeenCalledWith({ ...args, credentials: {
        apiKey: "test-paid", _opencodeZenSession: expect.stringMatching(SESSION_RE),
      } });
    } finally {
      delegate.mockRestore();
    }
  });
});
