import { afterEach, describe, expect, it, vi } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { PROVIDERS, PROVIDER_MODELS, PROVIDER_OAUTH } from "../../open-sse/providers/index.js";
import { getModelsByProviderId } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { parseModel, resolveProviderAlias } from "../../open-sse/services/model.js";
import { getAccessToken, refreshTokenByProvider } from "../../open-sse/services/tokenRefresh.js";
import { readFileSync } from "node:fs";

vi.mock("open-sse/index.js", () => ({}));

const PROVIDER = "nous";
const MODEL = "poolside/laguna-xs-2.1:free";
const service = () => import("../../open-sse/services/nous.js");
afterEach(() => vi.unstubAllGlobals());

describe("Nous registry and thinking", () => {
  it("registers dual-auth free-tier metadata and OpenAI transport", () => {
    const entry = REGISTRY.find((candidate) => candidate.id === PROVIDER);
    expect(entry).toMatchObject({
      category: "freeTier", hasFree: true, hasOAuth: true,
      authType: "oauth", authModes: ["oauth", "apikey"],
      passthroughModels: true, modelsFetcher: { type: "nous-free" },
    });
    expect(PROVIDERS[PROVIDER]).toMatchObject({ format: "openai", auth: { combined: true } });
    expect(PROVIDER_OAUTH[PROVIDER]).toMatchObject({ clientId: "hermes-cli" });
  });
  it("publishes eight static models through the shared catalog", () => {
    const models = getModelsByProviderId(PROVIDER);
    expect(models).toHaveLength(8);
    expect(PROVIDER_MODELS[PROVIDER]).toEqual(models);
    expect(models.every((model) => model.contextLength >= 262144)).toBe(true);
    expect(models.map((model) => model.id)).toContain(MODEL);
  });
  it("resolves aliases without interpreting vendor namespaces as providers", () => {
    for (const alias of [PROVIDER, "nous-portal", "nous-research", "ns"]) {
      expect(resolveProviderAlias(alias)).toBe(PROVIDER);
      expect(parseModel(`${alias}/${MODEL}`)).toMatchObject({ provider: PROVIDER, model: MODEL });
    }
  });
  it("advertises per-model reasoning and vision capabilities", () => {
    expect(getCapabilitiesForModel(PROVIDER, MODEL)).toMatchObject({
      reasoning: true, thinkingFormat: PROVIDER, contextWindow: 262144, maxOutput: 32768,
    });
    expect(getCapabilitiesForModel(PROVIDER, "stepfun/step-5-preview:free")).toMatchObject({
      vision: true, videoInput: true, contextWindow: 1000000,
    });
    expect(getThinkingLevels(PROVIDER, MODEL)).toEqual(["none", "low", "medium", "high"]);
  });
  it.each(["low", "medium", "high"])("emits nested reasoning for %s", (level) => {
    const body = { reasoning_effort: level };
    applyThinking("openai", MODEL, body, PROVIDER);
    expect(body).toEqual({ reasoning: { enabled: true, effort: level } });
  });
  it("omits disabled reasoning and defaults auto to medium", () => {
    expect(applyThinking("openai", MODEL, { reasoning_effort: "none" }, PROVIDER)).toEqual({});
    expect(applyThinking("openai", MODEL, { reasoning_effort: "auto" }, PROVIDER))
      .toEqual({ reasoning: { enabled: true, effort: "medium" } });
  });
});

describe("Nous catalog and credential probe", () => {
  const row = (id, extra = {}) => ({
    id, context_length: 262144, pricing: { prompt: "0", completion: 0 },
    architecture: { output_modalities: ["text"] }, ...extra,
  });
  it("normalizes metadata and prioritizes first-party text models", async () => {
    const { normalizeNousModels } = await service();
    expect(normalizeNousModels({ data: [
      row(MODEL, { top_provider: { max_completion_tokens: "32768" } }),
      row("nousresearch/hermes"), row("image-only", { architecture: { output_modalities: ["image"] } }),
      row("   "), null,
    ] })).toEqual([
      { id: "nousresearch/hermes", name: "nousresearch/hermes", contextLength: 262144 },
      { id: MODEL, name: MODEL, contextLength: 262144, maxOutputTokens: 32768 },
    ]);
  });
  it("filters free text models by both prices and minimum context", async () => {
    const { normalizeNousFreeModels } = await service();
    const models = normalizeNousFreeModels({ models: [
      row(MODEL), row("large", { context_length: 1000000 }),
      row("paid", { pricing: { prompt: "0", completion: "0.01" } }),
      row("unknown", { pricing: { prompt: null, completion: "0" } }),
      row("small", { context_length: 8192 }),
      row("embedding", { architecture: { output_modalities: ["embedding"] } }),
    ] });
    expect(models.map((model) => model.id)).toEqual(["large", MODEL]);
    expect(normalizeNousFreeModels({})).toEqual([]);
  });
  it("uses authenticated one-token free inference rather than public models for validation", async () => {
    const { createNousApiKeyProbe, NOUS_CHAT_COMPLETIONS_URL, NOUS_VALIDATION_MODEL } = await service();
    const probe = createNousApiKeyProbe("synthetic-key");
    expect(probe.url).toBe(NOUS_CHAT_COMPLETIONS_URL);
    expect(probe.options.headers.Authorization).toBe("Bearer synthetic-key");
    expect(JSON.parse(probe.options.body)).toMatchObject({ model: NOUS_VALIDATION_MODEL, max_tokens: 1, stream: false });
  });
  it.each([200, 204, 401, 402, 403, 429, 500])("accepts only 2xx credential probes (%s)", async (status) => {
    const { isNousApiKeyAccepted } = await service();
    expect(isNousApiKeyAccepted(status)).toBe(status >= 200 && status < 300);
  });
});

describe("Nous refresh mapping", () => {
  it.each([getAccessToken, refreshTokenByProvider])("refreshes and mints an agent key through the dispatch map (%#)", async (refresh) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "new-access", refresh_token: "rotated", expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ api_key: "new-agent", key_id: "key-id", expires_at: "2030-01-01" }));
    vi.stubGlobal("fetch", fetcher);
    const token = `refresh-${refresh.name}`;
    expect(await refresh(PROVIDER, { refreshToken: token })).toMatchObject({
      accessToken: "new-access", refreshToken: "rotated", apiKey: "new-agent",
      providerSpecificData: { agentKeyId: "key-id", agentKeyExpiresAt: "2030-01-01" },
    });
    const { NOUS_TOKEN_URL, NOUS_AGENT_KEY_URL } = await service();
    expect(fetcher.mock.calls[0][0]).toBe(NOUS_TOKEN_URL);
    expect(fetcher.mock.calls[0][1].headers["x-nous-refresh-token"]).toBe(token);
    expect(fetcher.mock.calls[0][1].body.get("client_id")).toBe(PROVIDER_OAUTH[PROVIDER].clientId);
    expect(fetcher.mock.calls[1][0]).toBe(NOUS_AGENT_KEY_URL);
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer new-access");
  });
  it("falls back to access token and preserves refresh token when minting fails", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "fallback-access", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 })));
    expect(await refreshTokenByProvider(PROVIDER, { refreshToken: "fallback-refresh" })).toMatchObject({
      accessToken: "fallback-access", apiKey: "fallback-access", refreshToken: "fallback-refresh",
    });
  });
  it("returns null on rejection without logging response secrets", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "synthetic-secret" }, { status: 400 })));
    const log = { error: vi.fn() };
    expect(await refreshTokenByProvider(PROVIDER, { refreshToken: "rejected-refresh" }, log)).toBeNull();
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("synthetic-secret");
  });
});

describe("Nous OAuth onboarding", () => {
  const oauth = () => import("../../src/lib/oauth/providers/index.js");
  it("registers a device-code adapter and modal entry using shared configuration", async () => {
    const { getProvider } = await oauth();
    const { NOUS_CONFIG, PROVIDERS: ids } = await import("../../src/lib/oauth/constants/oauth.js");
    expect(ids.NOUS).toBe(PROVIDER);
    expect(getProvider(PROVIDER)).toMatchObject({ flowType: "device_code", config: NOUS_CONFIG });
    expect(NOUS_CONFIG).toMatchObject({
      clientId: PROVIDER_OAUTH[PROVIDER].clientId,
      deviceCodeUrl: "https://portal.nousresearch.com/api/oauth/device/code",
      scope: "inference:invoke inference:mint_agent_key",
    });
    const modal = readFileSync(new URL("../../src/shared/components/OAuthModal.js", import.meta.url), "utf8");
    expect(modal.match(/const deviceCodeProviders = \[([\s\S]*?)\];/)[1]).toContain("OAUTH_PROVIDERS.NOUS");
  });
  it("requests device authorization without PKCE", async () => {
    const data = { device_code: "device", user_code: "USER", verification_uri: "https://portal.nousresearch.com/device", verification_uri_complete: "https://portal.nousresearch.com/device?code=USER", expires_in: 600, interval: 5 };
    const fetcher = vi.fn().mockResolvedValue(Response.json(data));
    vi.stubGlobal("fetch", fetcher);
    expect(await (await oauth()).requestDeviceCode(PROVIDER)).toEqual(data);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://portal.nousresearch.com/api/oauth/device/code");
    expect(options.method).toBe("POST");
    expect(Object.fromEntries(options.body)).toEqual({ client_id: "hermes-cli", scope: "inference:invoke inference:mint_agent_key" });
  });
  it.each(["authorization_pending", "slow_down", "access_denied", "expired_token"])("handles device polling %s without minting credentials", async (error) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error }, { status: 400 }));
    vi.stubGlobal("fetch", fetcher);
    const result = await (await oauth()).pollForToken(PROVIDER, "device");
    expect(result).toMatchObject({ success: false, error });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(fetcher.mock.calls[0][1].body)).toEqual({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: "hermes-cli", device_code: "device" });
  });
  it("maps the minted agent key and its metadata alongside OAuth tokens", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: "inference:invoke" }))
      .mockResolvedValueOnce(Response.json({ api_key: "agent", key_id: "id", expires_at: "2030-01-01" }));
    vi.stubGlobal("fetch", fetcher);
    expect(await (await oauth()).pollForToken(PROVIDER, "device")).toMatchObject({ success: true, tokens: {
      accessToken: "access", refreshToken: "refresh", expiresIn: 3600, apiKey: "agent",
      providerSpecificData: { inferenceBaseUrl: "https://inference-api.nousresearch.com/v1", agentKeyId: "id", agentKeyExpiresAt: "2030-01-01" },
    } });
    expect(fetcher.mock.calls[1][0]).toBe("https://portal.nousresearch.com/api/oauth/agent-key");
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer access");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ min_ttl_seconds: 7200 });
  });
  it("falls back to the OAuth token when agent-key minting is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "access", refresh_token: "refresh" }))
      .mockResolvedValueOnce(new Response(null, { status: 503 })));
    expect(await (await oauth()).pollForToken(PROVIDER, "device")).toMatchObject({ success: true, tokens: { accessToken: "access", apiKey: "access" } });
  });
  it("rejects device authorization errors without exposing upstream response contents", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("synthetic-secret", { status: 400 })));
    await expect((await oauth()).requestDeviceCode(PROVIDER)).rejects.toThrow("Nous device code request failed (400)");
  });
  it("reports malformed poll responses without persisting credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 502 })));
    expect(await (await oauth()).pollForToken(PROVIDER, "device")).toMatchObject({ success: false, error: "invalid_response" });
  });
  it("keeps minting failures secret-safe and falls back after network errors", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(Response.json({ access_token: "access" }))
        .mockRejectedValueOnce(new Error("synthetic-secret")));
      expect(await (await oauth()).pollForToken(PROVIDER, "device")).toMatchObject({ success: true, tokens: { apiKey: "access" } });
      expect(JSON.stringify(warning.mock.calls)).not.toContain("synthetic-secret");
    } finally {
      warning.mockRestore();
    }
  });
});
