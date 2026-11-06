// Integration regression (2026-11-07 clarification): an upstream pre-header
// socket reset on a COMBO MEMBER must hand off to the NEXT combo member
// immediately — not rotate through every account of the failed member first
// (production: River lanes with 4 accounts burned 4x reset attempts + seconds
// of client-facing delay per failed member before the combo ever advanced).
//
// Real chain under test: handleComboChat → handleSingleModelChat (account
// loop in src/sse/handlers/chat.js) → handleChatCore (real, undici-shaped
// reset via mocked proxyFetch — same fixture convention as
// chat-core-network-reset-ledger.test.js).
//
// Contract:
//   - classified pre-header reset + comboName → mark the failing connection
//     down ONCE, record the breaker failure ONCE, return the 502 to the combo
//     → the combo advances to the next member.
//   - standalone single-model reset → the account rotation is untouched
//     (still tries every account).
//   - deadline/abort failures (504 "request budget", no reset marker) →
//     rotate normally, never take the handoff path.
//   - the typed result carries failureType "upstream_network_reset" +
//     networkResetCode while preserving the 502 + existing error body.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROLE } from "../../open-sse/translator/schema/index.js";
import { HTTP_STATUS } from "../../open-sse/config/runtimeConfig.js";

const M1 = "deepseek/deepseek-chat"; // the failing member (reset)
const M2 = "deepseek/deepseek-v4.1-flash"; // the next member (healthy)
const HANDOFF_TAG = "COMBO_RESET_HANDOFF";

const effects = vi.hoisted(() => ({
  detail: vi.fn(async () => {}),
  usage: vi.fn(async () => {}),
  pending: vi.fn(),
  requestLog: vi.fn(async () => {}),
  fetch: vi.fn(),
  adapter: vi.fn(() => { throw new Error("combo-reset-handoff fixture forbids database access"); }),
  getProviderCredentials: vi.fn(),
  markAccountUnavailable: vi.fn(async () => ({ shouldFallback: true, cooldownMs: 1000 })),
  clearAccountError: vi.fn(async () => {}),
  getModelInfo: vi.fn(),
  getComboModels: vi.fn(async () => null),
  checkAndRefreshToken: vi.fn(async (_provider, creds) => creds),
  settings: vi.fn(async () => ({})),
  responseCacheHit: vi.fn(async () => null),
  responseCacheSet: vi.fn(async () => {}),
  // Module-level logger used by src/sse/handlers/chat.js (the handoff log path)
  modWarn: vi.fn(),
  modInfo: vi.fn(),
  modError: vi.fn(),
  modErrorLine: vi.fn(),
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
vi.mock("../../src/sse/services/auth.js", () => ({
  getProviderCredentials: effects.getProviderCredentials,
  markAccountUnavailable: effects.markAccountUnavailable,
  clearAccountError: effects.clearAccountError,
  extractApiKey: vi.fn(() => "qa-key"),
  isValidApiKey: vi.fn(() => true),
}));
vi.mock("../../src/sse/services/model.js", () => ({
  getModelInfo: effects.getModelInfo,
  getComboModels: effects.getComboModels,
}));
vi.mock("../../src/sse/services/tokenRefresh.js", () => ({
  updateProviderCredentials: vi.fn(async () => {}),
  checkAndRefreshToken: effects.checkAndRefreshToken,
}));
vi.mock("../../src/sse/services/antigravityQuota.js", () => ({
  handleAntigravityQuotaError: vi.fn(async () => null),
  clearAntigravityStrikes: vi.fn(),
}));
vi.mock("@/lib/localDb", () => ({
  getCachedSettings: effects.settings,
  getCombos: vi.fn(async () => []),
  getApiKeyByKey: vi.fn(async () => ({ id: "qa-key-id" })),
}));
vi.mock("@/lib/db/repos/responseCacheRepo.js", () => ({
  getResponseCacheEntry: effects.responseCacheHit,
  setResponseCacheEntry: effects.responseCacheSet,
}));
vi.mock("../../src/sse/utils/logger.js", () => ({
  nextTag: () => "qa",
  tagForSession: () => "qa",
  line: vi.fn(),
  errorLine: effects.modErrorLine,
  fmtThink: (intent) => intent,
  debug: vi.fn(),
  info: effects.modInfo,
  warn: effects.modWarn,
  error: effects.modError,
  request: vi.fn(),
  response: vi.fn(),
  stream: vi.fn(),
  maskKey: (key) => String(key || "").slice(0, 8) + "…",
}));

vi.stubGlobal("fetch", effects.fetch);
await import("../translator/registerAll.js");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCOUNTS = [
  { connectionId: "conn-river-00aa11bb22cc", connectionName: "river-a" },
  { connectionId: "conn-river-33dd44ee55ff", connectionName: "river-b" },
];

function undiciReset() {
  const outer = new TypeError("fetch failed");
  outer.cause = Object.assign(new Error("read ECONNRESET"), { code: "UND_ERR_SOCKET" });
  return outer;
}

function sse200(content) {
  const chunk = (delta, finish_reason) =>
    `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: "s2", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
  return new Response(
    chunk({ content }, null) + chunk({}, "stop") + "data: [DONE]\n\n",
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );
}

// 200 + SSE headers, then the body socket dies before any semantic event:
// first read yields a pre-semantic heartbeat, the second read rejects with
// the nested undici reset shape (the production River failure: request dir
// kept 1_req_client/2_req_source/4_req_target, no 5/6 files, no ledger line).
function sseBodyResetResponse() {
  const reset = new TypeError("fetch failed");
  reset.cause = Object.assign(new Error("read ECONNRESET"), { code: "UND_ERR_SOCKET" });
  let pulled = 0;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    pull(controller) {
      if (pulled === 0) {
        controller.enqueue(encoder.encode(": ping\n\n"));
      } else {
        controller.error(reset);
      }
      pulled += 1;
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function stubLoopEnv({ deadlineMs = 75000, maxAttempts = 8, connectTimeoutMs = 60000 } = {}) {
  vi.stubEnv("ACCOUNT_ROTATION_DEADLINE_MS", String(deadlineMs));
  vi.stubEnv("ACCOUNT_ROTATION_MAX_ATTEMPTS", String(maxAttempts));
  vi.stubEnv("FETCH_CONNECT_TIMEOUT_MS", String(connectTimeoutMs));
}

async function loadChain() {
  vi.resetModules();
  await import("../../open-sse/utils/requestLogger.js"); // warms under stubbed logging env
  const chat = await import("../../src/sse/handlers/chat.js");
  const combo = await import("../../open-sse/services/combo.js");
  const chatCore = await import("../../open-sse/handlers/chatCore.js");
  const logger = await import("../../open-sse/utils/requestLogger.js");
  const breaker = await import("../../open-sse/utils/circuitBreaker.js");
  return { handleSingleModelChat: chat.handleSingleModelChat, handleComboChat: combo.handleComboChat, handleChatCore: chatCore.handleChatCore, _flushLedger: () => logger._flushLedger(), breaker: breaker.circuitBreaker };
}

function ledgerLines(logsDir) {
  const file = path.join(logsDir, "errors.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// Minimal client-stream readers (same convention as combo-semantic-commit).
function readerFor(response) {
  return response.body.getReader();
}
function payloads(text) {
  return text.split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)));
}
async function drainAll(reader) {
  const decoder = new TextDecoder();
  let text = "";
  for (let i = 0; i < 64; i++) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    text += decoder.decode(value, { stream: true });
  }
  throw new Error("fixture exceeded 64 client chunks");
}

async function runCombo(chain, members, log) {
  const attempts = [];
  const response = await chain.handleComboChat({
    body: { stream: true, messages: [{ role: ROLE.USER, content: "fixture" }] },
    models: members,
    handleSingleModel: (b, m) => {
      attempts.push(m);
      return chain.handleSingleModelChat(b, m, null, null, null, "qa-combo", "127.0.0.1");
    },
    log,
    comboName: "qa-combo",
    comboStrategy: "fallback",
    comboStickyLimit: 1,
    comboFallbackDelayMs: 0,
    autoSwitch: false,
  });
  return { response, attempts };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let logsDir;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  effects.getModelInfo.mockImplementation((m) => ({ provider: m.split("/")[0], model: m.split("/")[1] }));
  effects.getProviderCredentials.mockImplementation(async (_provider, excluded) =>
    ACCOUNTS.find((a) => !excluded.has(a.connectionId)) || null
  );
  logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "combo-reset-handoff-logs-"));
  vi.stubEnv("ENABLE_REQUEST_LOGS", "true");
  vi.stubEnv("REQUEST_LOG_DIR", logsDir);
  stubLoopEnv();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
  if (logsDir && fs.existsSync(logsDir)) fs.rmSync(logsDir, { recursive: true, force: true });
});

afterAll(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("combo member pre-header upstream reset → immediate member handoff", () => {
  it("requests member 1 once on the failing account, then member 2 answers", async () => {
    const log = Object.fromEntries(["info", "warn", "debug", "line", "errorLine", "tagForSession"].map((n) => [n, vi.fn()]));
    const chain = await loadChain();

    // Member 1's model resets on EVERY account; member 2's model is healthy.
    effects.fetch.mockImplementation(async (_url, init) => {
      const model = String(JSON.parse(init.body).model);
      if (model.includes("deepseek-chat") && !model.includes("v4.1")) throw undiciReset();
      return sse200("qa combo member two ok");
    });

    const { response, attempts } = await runCombo(chain, [M1, M2], log);
    const text = await drainAll(readerFor(response));
    const content = payloads(text).map((p) => p.choices?.[0]?.delta?.content || "").join("");

    // Exactly one upstream attempt for the failing member (the old code tried
    // every River account — here both — before the combo could advance).
    expect(attempts).toEqual([M1, M2]);
    const fetchModels = effects.fetch.mock.calls.map(([, init]) => String(JSON.parse(init.body).model));
    expect(fetchModels.filter((m) => m.includes("deepseek-chat") && !m.includes("v4.1"))).toHaveLength(1);
    expect(response.status).toBe(200);
    expect(content).toBe("qa combo member two ok");

    // The failing connection is cooled down exactly once (so a repeated
    // client request does not pick it immediately), breaker failure once.
    expect(effects.markAccountUnavailable).toHaveBeenCalledTimes(1);
    expect(effects.markAccountUnavailable.mock.calls[0].slice(0, 3)).toEqual(
      ["conn-river-00aa11bb22cc", HTTP_STATUS.BAD_GATEWAY, expect.stringContaining("fetch failed")]
    );

    // The handoff is logged with combo name, failed model, masked connection
    // id, reset code and the next-member action — and no credential/secret.
    // (chat.js emits it on its module-level logger, not the combo's log param.)
    const handoffs = effects.modWarn.mock.calls.filter(([tag]) => tag === HANDOFF_TAG);
    expect(handoffs).toHaveLength(1);
    const [tag, message, payload] = handoffs[0];
    expect(tag).toBe(HANDOFF_TAG);
    expect(message).toContain("qa-combo");
    expect(message).toContain("deepseek/deepseek-chat");
    expect(payload).toMatchObject({ model: "deepseek/deepseek-chat", code: "UND_ERR_SOCKET" });
    expect(String(payload.connectionId).length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(handoffs[0])).not.toContain("qa-key");

    // The durable ledger still records the reset (part-1 contract kept).
    await chain._flushLedger();
    const resetLines = ledgerLines(logsDir).filter((l) => l.reason === "upstream_network_reset" && !l.ledgerType);
    expect(resetLines).toHaveLength(1);
    expect(resetLines[0]).toMatchObject({
      provider: "deepseek",
      model: "deepseek-chat",
      statusCode: HTTP_STATUS.BAD_GATEWAY,
      code: "UND_ERR_SOCKET",
      urlIndex: 0,
    });
  }, 20000);

  it("member 1 200-then-body-reset before a semantic event: one fetch, one mark, immediate handoff + durable ledger", async () => {
    const log = Object.fromEntries(["info", "warn", "debug", "line", "errorLine", "tagForSession"].map((n) => [n, vi.fn()]));
    const chain = await loadChain();

    // Member 1: upstream accepts (200 + SSE headers), sends a pre-semantic
    // heartbeat, then the body socket resets — on EVERY account.
    // Member 2: healthy stream.
    const PROMPT = "qa secret prompt payload xyz";
    effects.fetch.mockImplementation(async (_url, init) => {
      const model = String(JSON.parse(init.body).model);
      if (model.includes("deepseek-chat") && !model.includes("v4.1")) return sseBodyResetResponse();
      return sse200("qa combo member two ok");
    });

    const body = { stream: true, messages: [{ role: ROLE.USER, content: PROMPT }] };
    const response = await chain.handleComboChat({
      body,
      models: [M1, M2],
      handleSingleModel: (b, m) => chain.handleSingleModelChat(b, m, null, null, null, "qa-combo", "127.0.0.1"),
      log,
      comboName: "qa-combo",
      comboStrategy: "fallback",
      comboStickyLimit: 1,
      comboFallbackDelayMs: 0,
      autoSwitch: false,
    });
    const text = await drainAll(readerFor(response));
    const content = payloads(text).map((p) => p.choices?.[0]?.delta?.content || "").join("");

    // Exactly ONE upstream attempt for the failing member: the old code
    // rotated every River account on the dead endpoint before the combo
    // could advance (both accounts here).
    const fetchModels = effects.fetch.mock.calls.map(([, init]) => String(JSON.parse(init.body).model));
    expect(fetchModels.filter((m) => m.includes("deepseek-chat") && !m.includes("v4.1"))).toHaveLength(1);
    // Member 2 answers; member 1's pre-commit 502 is never exposed to the
    // client.
    expect(response.status).toBe(200);
    expect(content).toBe("qa combo member two ok");
    expect(text).not.toContain("upstream stream failed before semantic output");

    // The failing connection is cooled down exactly once (mark carries the
    // pre-semantic failure, status 502).
    expect(effects.markAccountUnavailable).toHaveBeenCalledTimes(1);
    expect(effects.markAccountUnavailable.mock.calls[0].slice(0, 3)).toEqual([
      "conn-river-00aa11bb22cc",
      HTTP_STATUS.BAD_GATEWAY,
      expect.stringContaining("before semantic output"),
    ]);

    // One typed combo handoff (id masked, reset code, next-member action).
    const handoffs = effects.modWarn.mock.calls.filter(([tag]) => tag === HANDOFF_TAG);
    expect(handoffs).toHaveLength(1);
    const [tag, message, payload] = handoffs[0];
    expect(tag).toBe(HANDOFF_TAG);
    expect(message).toContain("qa-combo");
    expect(message).toContain("deepseek/deepseek-chat");
    expect(payload).toMatchObject({ model: "deepseek/deepseek-chat", code: "UND_ERR_SOCKET", action: "next-member" });
    expect(String(payload.connectionId).length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(handoffs[0])).not.toContain("qa-key");

    // Durable ledger: pre-commit reset is now recorded (the production River
    // dirs had NO 6_error/6_stream_termination and no ledger line). No raw
    // prompt lands in either record — only error metadata.
    await chain._flushLedger();
    const lines = ledgerLines(logsDir);
    const errorLines = lines.filter((l) => l.reason === "upstream_network_reset" && !l.ledgerType);
    expect(errorLines).toHaveLength(1);
    expect(errorLines[0]).toMatchObject({
      provider: "deepseek",
      model: "deepseek-chat",
      statusCode: HTTP_STATUS.BAD_GATEWAY,
      code: "UND_ERR_SOCKET",
    });
    expect(errorLines[0].durationMs).toBeGreaterThanOrEqual(0);
    const termLines = lines.filter((l) => l.reason === "upstream_network_reset" && l.ledgerType === "streamTermination");
    expect(termLines).toHaveLength(1);
    expect(termLines[0]).toMatchObject({ provider: "deepseek", model: "deepseek-chat", code: "UND_ERR_SOCKET" });
    expect(termLines[0].bytes).toBeGreaterThan(0);   // the probed heartbeat chunk
    expect(termLines[0].chunks).toBe(1);
    expect(termLines[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(errorLines[0])).not.toContain(PROMPT);
    expect(JSON.stringify(termLines[0])).not.toContain(PROMPT);
    // The session dir carries the 6_stream_termination artifact now.
    const termFile = path.join(termLines[0].sessionDir, "6_stream_termination.json");
    expect(fs.existsSync(termFile)).toBe(true);
    expect(fs.readFileSync(termFile, "utf8")).not.toContain(PROMPT);
  }, 20000);

  it("standalone single-model reset still rotates all accounts (no handoff)", async () => {
    const chain = await loadChain();
    effects.fetch.mockImplementation(async () => { throw undiciReset(); });

    const response = await chain.handleSingleModelChat(
      { stream: true, messages: [{ role: ROLE.USER, content: "x" }] },
      M1, null, null, null, null, "127.0.0.1"
    );

    // Both accounts were tried (rotation unchanged), then the pool is
    // exhausted and the last 502 is returned.
    expect(effects.fetch).toHaveBeenCalledTimes(2);
    expect(effects.markAccountUnavailable).toHaveBeenCalledTimes(2);
    expect(effects.modWarn.mock.calls.filter(([t]) => t === HANDOFF_TAG)).toHaveLength(0);
    expect(response.status).toBe(HTTP_STATUS.BAD_GATEWAY);
  }, 20000);

  it("an abort failure (499, no reset marker) rotates instead of handing off", async () => {
    vi.stubEnv("ACCOUNT_ROTATION_MAX_ATTEMPTS", "2");
    const chain = await loadChain();

    // The executor re-throws client/deadline aborts as AbortError — no timers
    // needed: reject immediately with that shape. chatCore answers 499 BEFORE
    // the reset classification runs, so the marker can never be present.
    effects.fetch.mockImplementation(() => {
      const e = new Error("The user aborted a request.");
      e.name = "AbortError";
      return Promise.reject(e);
    });

    const response = await chain.handleSingleModelChat(
      { stream: true, messages: [{ role: ROLE.USER, content: "x" }] },
      M1, null, null, null, null, "127.0.0.1"
    );

    // Two aborted attempts (normal rotation via the failure path), zero
    // handoffs: an abort is a client/budget failure, never a network reset.
    expect(effects.fetch).toHaveBeenCalledTimes(2);
    expect(effects.markAccountUnavailable).toHaveBeenCalledTimes(2);
    expect(effects.modWarn.mock.calls.filter(([t]) => t === HANDOFF_TAG)).toHaveLength(0);
    expect(response.status).toBe(499);
  }, 20000);

  it("a deadline abort (504, no reset marker) carries no handoff marker", async () => {
    const chain = await loadChain();
    effects.fetch.mockImplementation(() => {
      const e = new Error("The user aborted a request.");
      e.name = "AbortError";
      return Promise.reject(e);
    });

    const deadline = new AbortController();
    deadline.abort(); // the route's attempt Signal at budget expiry
    const result = await chain.handleChatCore({
      body: { model: M1, stream: true, messages: [{ role: ROLE.USER, content: "x" }] },
      modelInfo: { provider: "deepseek", model: "deepseek-chat" },
      credentials: { accessToken: "test-token" },
      log: Object.fromEntries(["info", "warn", "debug", "line", "errorLine", "tagForSession"].map((n) => [n, vi.fn()])),
      connectionId: "conn-river-00aa11bb22cc",
      deadlineSignal: deadline.signal,
    });

    expect(result.status).toBe(HTTP_STATUS.GATEWAY_TIMEOUT);
    expect(result.error).toContain("request budget");
    expect(result.failureType).toBeUndefined();
    expect(result.networkResetCode).toBeUndefined();
  }, 20000);
});

describe("handleChatCore pre-header reset result carries the typed marker", () => {
  it("failureType + networkResetCode preserve the 502 and existing error body", async () => {
    const chain = await loadChain();
    effects.fetch.mockImplementation(async () => { throw undiciReset(); });

    const result = await chain.handleChatCore({
      body: { model: M1, stream: true, messages: [{ role: ROLE.USER, content: "x" }] },
      modelInfo: { provider: "deepseek", model: "deepseek-chat" },
      credentials: { accessToken: "test-token" },
      log: Object.fromEntries(["info", "warn", "debug", "line", "errorLine", "tagForSession"].map((n) => [n, vi.fn()])),
      connectionId: "conn-river-00aa11bb22cc",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(HTTP_STATUS.BAD_GATEWAY); // 502 semantics preserved
    expect(result.error).toContain("fetch failed"); // existing error body preserved
    expect(result.failureType).toBe("upstream_network_reset");
    expect(result.networkResetCode).toBe("UND_ERR_SOCKET");
  }, 20000);

  it("a non-reset network error (ENOTFOUND) carries NO marker (keeps the 502 retry mapping)", async () => {
    const chain = await loadChain();
    // DEFAULT_RETRY_CONFIG 502 = 3 retries × 3000 ms — advance the fake clock
    // instead of waiting 9 s of wall time.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    effects.fetch.mockImplementation(async () => { throw new Error("getaddrinfo ENOTFOUND deepseek.example.com"); });

    const p = chain.handleChatCore({
      body: { model: M1, stream: true, messages: [{ role: ROLE.USER, content: "x" }] },
      modelInfo: { provider: "deepseek", model: "deepseek-chat" },
      credentials: { accessToken: "test-token" },
      log: Object.fromEntries(["info", "warn", "debug", "line", "errorLine", "tagForSession"].map((n) => [n, vi.fn()])),
      connectionId: "conn-river-00aa11bb22cc",
    });
    let settled;
    p.then((r) => { settled = r; }, (e) => { settled = { __reject: e }; });
    for (let i = 0; i < 10 && settled === undefined; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    expect(settled, "chatCore must settle after the 502 retry budget").toBeDefined();
    const result = settled.__reject ? (() => { throw settled.__reject; })() : settled;

    // ENOTFOUND is not a classified reset: no handoff marker, but the legacy
    // 502 retry mapping still consumed the full retry budget.
    expect(result.failureType).toBeUndefined();
    expect(result.networkResetCode).toBeUndefined();
    expect(result.status).toBe(HTTP_STATUS.BAD_GATEWAY);
    expect(effects.fetch).toHaveBeenCalledTimes(4); // 1 + 3 retries
  }, 20000);
});
