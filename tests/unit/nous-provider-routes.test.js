import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ connection: null, updates: vi.fn(), create: vi.fn() }));
vi.mock("@/models", () => ({ getProviderConnectionById: async () => store.connection, getProviderNodeById: vi.fn(), createProviderConnection: store.create }));
vi.mock("open-sse/index.js", () => ({}));
vi.mock("@/lib/oauth/utils/server", () => ({}));
vi.mock("@/lib/oauth/utils/ideDetect", () => ({ detectIdeInstalled: vi.fn() }));
vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: async () => store.connection,
  updateProviderConnection: store.updates,
  getProviderConnections: async () => [store.connection],
  getCombos: async () => [], getCustomModels: async () => [], getModelAliases: async () => ({}),
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => ({}) }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: async () => ({}) }));

import { GET as listModels } from "@/app/api/providers/[id]/models/route.js";
import { testSingleConnection } from "@/app/api/providers/[id]/test/testUtils.js";
import { buildModelsList } from "@/app/api/v1/models/route.js";
import { FILTERS } from "@/app/api/providers/suggested-models/filters.js";

const PROVIDER = "nous";
const MODEL = "poolside/laguna-xs-2.1:free";
beforeEach(() => {
  store.connection = { id: "nous-fixture", provider: PROVIDER, authType: "apikey", apiKey: "portal-key", isActive: true, providerSpecificData: {} };
  store.updates.mockClear();
  store.updates.mockResolvedValue({ id: "nous-fixture" });
  store.create.mockReset();
  store.create.mockImplementation(async (connection) => ({ ...connection, id: "new-nous" }));
});

describe("Nous onboarding routes", () => {
  const route = () => import("@/app/api/oauth/[provider]/[action]/route.js");
  const context = (action) => ({ params: Promise.resolve({ provider: PROVIDER, action }) });
  const poll = async (body = { deviceCode: "device" }) => (await route()).POST(new Request("http://localhost/api/oauth/nous/poll", { method: "POST", body: JSON.stringify(body) }), context("poll"));
  it("returns device authorization instructions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ device_code: "device", user_code: "USER", verification_uri: "https://portal.nousresearch.com/device" })));
    const response = await (await route()).GET(new Request("http://localhost/api/oauth/nous/device-code"), context("device-code"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ device_code: "device", user_code: "USER" });
  });
  it("persists OAuth and agent-key credentials without requiring a PKCE verifier or leaking tokens", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ api_key: "agent", key_id: "id" })));
    const response = await poll();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, connection: { id: "new-nous", provider: PROVIDER } });
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({ provider: PROVIDER, authType: "oauth", accessToken: "access", refreshToken: "refresh", apiKey: "agent", expiresAt: expect.any(String), providerSpecificData: expect.objectContaining({ agentKeyId: "id" }) }));
  });
  it.each(["authorization_pending", "slow_down", "access_denied", "expired_token"])("does not persist a connection on %s", async (error) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error }, { status: 400 })));
    const response = await poll();
    expect(await response.json()).toMatchObject({ success: false, error, pending: ["authorization_pending", "slow_down"].includes(error) });
    expect(store.create).not.toHaveBeenCalled();
  });
  it("rejects polling without a device code before calling upstream", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await poll({})).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([200, 401, 402, 403, 429, 500])("validates initial API keys using authenticated inference (%s)", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetcher);
    const { POST } = await import("@/app/api/providers/validate/route.js");
    const response = await POST(new Request("http://localhost/api/providers/validate", { method: "POST", body: JSON.stringify({ provider: PROVIDER, apiKey: "portal-key" }) }));
    expect(await response.json()).toMatchObject({ valid: status === 200 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://inference-api.nousresearch.com/v1/chat/completions");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer portal-key");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ model: MODEL, max_tokens: 1 });
  });
  it("persists rotated agent keys through the common refresh service", async () => {
    const { updateProviderCredentials, refreshNousToken } = await import("@/sse/services/tokenRefresh.js");
    expect(refreshNousToken).toBeTypeOf("function");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "wrapper-access", refresh_token: "wrapper-rotated" }))
      .mockResolvedValueOnce(Response.json({ api_key: "wrapper-agent" })));
    expect(await refreshNousToken("wrapper-refresh")).toMatchObject({ accessToken: "wrapper-access", refreshToken: "wrapper-rotated", apiKey: "wrapper-agent" });
    expect(await updateProviderCredentials("nous-fixture", { accessToken: "fresh-access", apiKey: "fresh-agent", providerSpecificData: { agentKeyId: "fresh-id" }, existingProviderSpecificData: { preserved: true } })).toBe(true);
    expect(store.updates).toHaveBeenCalledWith("nous-fixture", expect.objectContaining({ accessToken: "fresh-access", apiKey: "fresh-agent", providerSpecificData: { preserved: true, agentKeyId: "fresh-id" } }));
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Nous model routes", () => {
  it("lists live namespaced chat models with routable owning-provider prefixes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [
      { id: MODEL, context_length: 262144 },
      { id: "image-only", architecture: { output_modalities: ["image"] } },
    ] })));
    const res = await listModels(new Request("http://localhost/api/providers/nous-fixture/models"), { params: Promise.resolve({ id: "nous-fixture" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).models).toEqual([
      { id: `${PROVIDER}/${MODEL}`, upstreamModelId: MODEL, name: MODEL, contextLength: 262144 },
    ]);
  });
  it("exposes static models through the actual public catalog builder for an active connection", async () => {
    const models = (await buildModelsList(["llm"])).filter((model) => model.owned_by === PROVIDER);
    expect(models).toHaveLength(8);
    expect(models.map((model) => model.id)).toContain(`${PROVIDER}/${MODEL}`);
  });
  it("registers a free-model filter for live suggested models", () => {
    expect(FILTERS["nous-free"]).toBeTypeOf("function");
    expect(FILTERS["nous-free"]([
      { id: MODEL, context_length: 262144, pricing: { prompt: "0", completion: "0" } },
      { id: "paid", context_length: 262144, pricing: { prompt: "1", completion: "0" } },
    ]).map((model) => model.id)).toEqual([MODEL]);
  });
});

describe("Nous saved-connection probes", () => {
  it.each([200, 401, 402, 429, 500])("uses inference and never accepts public models as credential proof (%s)", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetcher);
    const result = await testSingleConnection(store.connection.id);
    expect(result.valid).toBe(status === 200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://inference-api.nousresearch.com/v1/chat/completions");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer portal-key");
    expect(JSON.parse(options.body)).toMatchObject({ model: MODEL, max_tokens: 1 });
  });
  it("prefers the minted agent key for OAuth inference", async () => {
    store.connection = { ...store.connection, authType: "oauth", accessToken: "access-token" };
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect((await testSingleConnection(store.connection.id)).valid).toBe(true);
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer portal-key");
  });
  it("refreshes expired OAuth credentials and persists the newly minted inference key", async () => {
    store.connection = { ...store.connection, authType: "oauth", accessToken: "expired-access", refreshToken: "route-refresh", expiresAt: "2000-01-01" };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "fresh-access", refresh_token: "rotated-refresh", expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ api_key: "fresh-agent" }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await testSingleConnection(store.connection.id)).toMatchObject({ valid: true, refreshed: true });
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBe("Bearer fresh-agent");
    expect(store.updates).toHaveBeenCalledWith(store.connection.id, expect.objectContaining({ apiKey: "fresh-agent", accessToken: "fresh-access", refreshToken: "rotated-refresh" }));
  });
});
