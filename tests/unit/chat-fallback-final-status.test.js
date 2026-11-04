// Regression: an upstream 504 retried through the account-fallback pool used to
// collapse to a generic HTTP 503 against the client (live 2026-11-05, 3.3.27:
// qafix/html504 answered 503 "(reset after 5s)" after 3× 504 upstream hits, even
// though the pool was exhausted on gateway timeouts). The allRateLimited branch of
// handleChat's account-rotation loop must preserve the last definitive upstream
// gateway status (502/503/504) — for this request's last attempt (lastStatus) or,
// on zero-attempt pool exhaustion, the status persisted on the earliest-cooling
// account (credentials.lastErrorCode).
//
// The 429 rate-limit pool MUST keep its existing 503 + reset-after behavior —
// that is the caller-visible contract for an exhausted rate-limited pool, not a
// regression.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Dependency stubs (heavy I/O modules around the rotation loop) ────────────
vi.mock("open-sse/index.js", () => ({}));

vi.mock("@/lib/localDb", () => ({
  getCachedSettings: vi.fn(async () => ({})),
  getCombos: vi.fn(async () => null),
  getApiKeyByKey: vi.fn(async () => null),
}));

vi.mock("@/sse/services/auth.js", () => ({
  getProviderCredentials: vi.fn(),
  markAccountUnavailable: vi.fn(),
  clearAccountError: vi.fn(async () => ({})),
  extractApiKey: vi.fn(() => null),
  isValidApiKey: vi.fn(async () => true),
}));

vi.mock("@/sse/services/model.js", () => ({
  getModelInfo: vi.fn(),
  getComboModels: vi.fn(async () => null),
}));

vi.mock("@/sse/services/tokenRefresh.js", () => ({
  checkAndRefreshToken: vi.fn(async (provider, credentials) => credentials),
  updateProviderCredentials: vi.fn(async () => {}),
}));

vi.mock("@/sse/services/antigravityQuota.js", () => ({
  handleAntigravityQuotaError: vi.fn(async () => null),
  clearAntigravityStrikes: vi.fn(() => {}),
}));

vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  errorLine: vi.fn(),
  maskKey: (s) => String(s).slice(0, 4),
}));

vi.mock("open-sse/handlers/chatCore.js", () => ({
  handleChatCore: vi.fn(),
}));

vi.mock("open-sse/handlers/chatCore/requestDetail.js", () => ({
  saveRequestError: vi.fn(async () => {}),
}));

vi.mock("open-sse/services/combo.js", () => ({
  handleComboChat: vi.fn(),
  handleFusionChat: vi.fn(),
  detectRequiredCapabilities: vi.fn(() => new Set()),
  partitionComboMembers: vi.fn(async (models) => ({ safe: models, self: [] })),
}));

vi.mock("open-sse/services/capacityAdapter.js", () => ({
  augmentModelsWithCapacityAdapter: vi.fn((models) => models),
  withCapacityAdapterStripping: vi.fn((fn) => fn),
  getActiveAdapterStrategy: vi.fn(() => "fallback"),
}));

vi.mock("open-sse/services/responseCache.js", () => ({
  buildCacheKey: vi.fn(async () => null),
  isCacheableRequest: vi.fn(() => false),
  isCacheEntryLive: vi.fn(() => false),
  DEFAULT_RESPONSE_CACHE_TTL_MS: 30000,
}));

vi.mock("@/lib/db/repos/responseCacheRepo.js", () => ({
  getResponseCacheEntry: vi.fn(async () => null),
  setResponseCacheEntry: vi.fn(async () => {}),
}));

vi.mock("open-sse/services/projectId.js", () => ({
  getProjectIdForConnection: vi.fn(async () => null),
}));

vi.mock("open-sse/utils/bypassHandler.js", () => ({
  handleBypassRequest: vi.fn(() => null),
}));

vi.mock("open-sse/providers/opencodeFreeStatus.js", () => ({
  getOpencodeRetirement: vi.fn(() => null),
}));

vi.mock("open-sse/translator/formats.js", () => ({
  detectFormatByEndpoint: vi.fn(() => "openai"),
}));

vi.mock("@/lib/headroom/detect", () => ({
  DEFAULT_HEADROOM_URL: "http://headroom.invalid",
}));

vi.mock("@/lib/pxpipe/loader.js", () => ({
  getTransform: vi.fn(async () => null),
}));

vi.mock("@/lib/pxpipe/events.js", () => ({
  appendPxpipeEvent: vi.fn(() => {}),
}));

vi.mock("@/lib/bodyLimit.js", () => ({
  checkBodyLimit: vi.fn(() => ({ ok: true })),
  MAX_BODY_BYTES: 25_000_000,
}));

vi.mock("@/lib/rateLimit.js", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
  checkTpmLimit: vi.fn(() => ({ ok: true })),
}));

vi.mock("@/lib/apiKeyPolicy.js", () => ({
  isModelAllowedForKey: vi.fn(() => true),
}));

vi.mock("@/lib/budget.js", () => ({
  reserveBudget: vi.fn(async () => ({ ok: true })),
}));

// ── Under test ───────────────────────────────────────────────────────────────
import { handleChat } from "@/sse/handlers/chat.js";
import { getProviderCredentials, markAccountUnavailable } from "@/sse/services/auth.js";
import { handleChatCore } from "open-sse/handlers/chatCore.js";
import { getModelInfo } from "@/sse/services/model.js";

const MODEL = "qafix/html504";
const UPSTREAM_BODY = "<html><head><title>504 Gateway Time-out</title></head><body>nginx</body></html>";

function makeRequest(model = MODEL) {
  const payload = JSON.stringify({ model, messages: [{ role: "user", content: "ping" }] });
  return {
    url: "http://localhost:20128/v1/chat/completions",
    headers: new Headers({ "content-type": "application/json", "user-agent": "status-test" }),
    text: async () => payload,
  };
}

/**
 * Three-account pool: hands out one connection per call until every id is
 * excluded, then returns the allRateLimited exhaustion shape with the given
 * persisted errorCode (what markAccountUnavailable wrote on the accounts).
 */
function stubPool({ lastErrorCode, lastError, resetInMs = 5000 }) {
  const accounts = [
    { id: "conn-1", connectionId: "conn-1", connectionName: "acc-1" },
    { id: "conn-2", connectionId: "conn-2", connectionName: "acc-2" },
    { id: "conn-3", connectionId: "conn-3", connectionName: "acc-3" },
  ];
  const resetAfter = new Date(Date.now() + resetInMs).toISOString();
  getProviderCredentials.mockImplementation(async (_provider, exclude) => {
    const excluded = exclude instanceof Set ? exclude : new Set(exclude || []);
    const next = accounts.find((a) => !excluded.has(a.id));
    if (!next) {
      return {
        allRateLimited: true,
        retryAfter: resetAfter,
        retryAfterHuman: `reset after ${Math.ceil(resetInMs / 1000)}s`,
        lastError,
        lastErrorCode,
      };
    }
    return next;
  });
}

/** Stub handleChatCore to fail every attempt with the given upstream status. */
function stubUpstreamFailure(status, body = UPSTREAM_BODY) {
  handleChatCore.mockResolvedValue({
    success: false,
    status,
    error: `[${status}]: ${body}`,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Provider is never antigravity/codex, so the quota hooks stay dead.
  markAccountUnavailable.mockResolvedValue({ shouldFallback: true, cooldownMs: 5000 });
  getModelInfo.mockResolvedValue({ provider: "qafix", model: "html504" });
});

async function runExhaustion({ lastErrorCode, lastError, upstreamStatus }) {
  stubPool({ lastErrorCode, lastError, resetInMs: 5000 });
  stubUpstreamFailure(upstreamStatus);
  const response = await handleChat(makeRequest(MODEL));
  const json = await response.json();
  return { response, message: json?.error?.message || "" };
}

describe("account-rotation pool exhaustion — final status preservation", () => {
  it("504 exhausted through the fallback pool returns 504 and the message names 504", async () => {
    const { response, message } = await runExhaustion({
      lastErrorCode: 504,
      lastError: `[504]: ${UPSTREAM_BODY}`,
      upstreamStatus: 504,
    });

    expect(response.status).toBe(504);
    expect(message).toContain("504");
    // reset-after semantics must travel with the preserved status
    expect(message).toContain("reset after 5s");
    expect(response.headers.get("Retry-After")).toBe("5");
    // the pool was actually exhausted through fallback: 3 accounts, 3 upstream hits
    expect(handleChatCore).toHaveBeenCalledTimes(3);
    expect((response.headers.get("content-type") || "").includes("application/json")).toBe(true);
  });

  it.each([502, 503, 504])("%i exhausted through the fallback pool keeps its own status", async (status) => {
    const { response, message } = await runExhaustion({
      lastErrorCode: status,
      lastError: `[${status}]: ${UPSTREAM_BODY}`,
      upstreamStatus: status,
    });

    expect(response.status).toBe(status);
    expect(message).toContain(String(status));
  });

  it("429 rate-limit pool still returns 503 + reset-after (existing contract)", async () => {
    const { response, message } = await runExhaustion({
      lastErrorCode: 429,
      lastError: "[429]: rate limit exceeded, retry later",
      upstreamStatus: 429,
    });

    expect(response.status).toBe(503);
    expect(message).toContain("429");
    expect(message).toContain("reset after 5s");
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(handleChatCore).toHaveBeenCalledTimes(3);
  });

  it("zero-attempt exhaustion on a pool cooled by an earlier 504 keeps 504 (persisted lastErrorCode)", async () => {
    // The pool is already cooling before this request runs: the very first
    // getProviderCredentials call answers allRateLimited with the persisted
    // errorCode from the previous request. lastStatus is null here, so the
    // preserved status must come from credentials.lastErrorCode.
    const resetAfter = new Date(Date.now() + 5000).toISOString();
    getProviderCredentials.mockResolvedValue({
      allRateLimited: true,
      retryAfter: resetAfter,
      retryAfterHuman: "reset after 5s",
      lastError: `[504]: ${UPSTREAM_BODY}`,
      lastErrorCode: 504,
    });

    const response = await handleChat(makeRequest(MODEL));
    const message = (await response.json()).error.message;

    expect(handleChatCore).not.toHaveBeenCalled();
    expect(response.status).toBe(504);
    expect(message).toContain("504");
    expect(message).toContain("reset after 5s");
  });

  it("non-gateway failures keep the historic generic 503", async () => {
    const { response, message } = await runExhaustion({
      lastErrorCode: 401,
      lastError: "[401]: invalid api key",
      upstreamStatus: 401,
    });

    expect(response.status).toBe(503);
    expect(message).toContain("401"); // the real failure still travels in the message
    expect(message).toContain("reset after 5s");
  });
});
