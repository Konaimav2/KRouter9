import { NextResponse } from "next/server";
import {
  getProviderConnections,
  getProviderConnectionCount,
  getProviderConnectionStats,
  createProviderConnection,
  getProviderNodeById,
  getProviderNodes,
  getProxyPoolById,
} from "@/models";
import { APIKEY_PROVIDERS } from "@/shared/constants/config";
import { AI_PROVIDERS, FREE_TIER_PROVIDERS, WEB_COOKIE_PROVIDERS, isOpenAICompatibleProvider, isAnthropicCompatibleProvider, isCustomEmbeddingProvider } from "@/shared/constants/providers";
import { normalizeProviderId, normalizeProviderSpecificData } from "@/lib/providerNormalization";
import { applyCustomHeaders } from "open-sse/utils/customHeaders.js";

export const dynamic = "force-dynamic";

function normalizeProxyConfig(body = {}) {
  const enabled = body?.connectionProxyEnabled === true;
  const url = typeof body?.connectionProxyUrl === "string" ? body.connectionProxyUrl.trim() : "";
  const noProxy = typeof body?.connectionNoProxy === "string" ? body.connectionNoProxy.trim() : "";

  if (enabled && !url) {
    return { error: "Connection proxy URL is required when connection proxy is enabled" };
  }

  return {
    connectionProxyEnabled: enabled,
    connectionProxyUrl: url,
    connectionNoProxy: noProxy,
  };
}

async function normalizeProxyPoolId(proxyPoolId) {
  if (proxyPoolId === undefined || proxyPoolId === null || proxyPoolId === "" || proxyPoolId === "__none__") {
    return { proxyPoolId: null };
  }

  const normalizedId = String(proxyPoolId).trim();
  if (!normalizedId) {
    return { proxyPoolId: null };
  }

  const proxyPool = await getProxyPoolById(normalizedId);
  if (!proxyPool) {
    return { error: "Proxy pool not found" };
  }

  return { proxyPoolId: normalizedId };
}

// GET /api/providers - List connections.
//
// P2 scaling: default returns a paginated, list-shaped payload that strips the
// large `providerSpecificData`/`modelLock_*` fields. `?mode=full` preserves the
// legacy unpaginated shape for internal callers (playground, CLI, migrate).
// Query: ?page=1&pageSize=50&provider=...&isActive=1&mode=full&stats=1
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url || "http://localhost/api/providers");
    const mode = searchParams.get("mode");
    const wantStats = searchParams.get("stats") === "1";
    const provider = searchParams.get("provider") || undefined;
    const isActiveParam = searchParams.get("isActive");

    const baseFilter = {};
    if (provider) baseFilter.provider = provider;
    if (isActiveParam === "1" || isActiveParam === "true") baseFilter.isActive = true;
    else if (isActiveParam === "0" || isActiveParam === "false") baseFilter.isActive = false;

    // Build nodeNameMap for compatible providers (id → name)
    let nodeNameMap = {};
    try {
      const nodes = await getProviderNodes();
      for (const node of nodes) {
        if (node.id && node.name) nodeNameMap[node.id] = node.name;
      }
    } catch { }

    const enrich = (c) => {
      const isCompatible = isOpenAICompatibleProvider(c.provider) || isAnthropicCompatibleProvider(c.provider);
      const name = isCompatible
        ? (c.name || nodeNameMap[c.provider] || c.providerSpecificData?.nodeName || c.provider)
        : c.name;
      return { ...c, name };
    };

    // Stats are a cheap SQL GROUP BY; safe to include on any mode.
    const stats = wantStats ? await getProviderConnectionStats() : undefined;

    if (mode === "full") {
      const connections = await getProviderConnections(baseFilter);
      const safeConnections = connections.map((c) => ({
        ...enrich(c),
        apiKey: undefined,
        accessToken: undefined,
        refreshToken: undefined,
        idToken: undefined,
      }));
      return NextResponse.json({ connections: safeConnections, ...(stats ? { stats } : {}) });
    }

    // Paginated list mode (default). Strip heavy + sensitive fields.
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const rawPageSize = Number(searchParams.get("pageSize"));
    const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0
      ? Math.min(Math.floor(rawPageSize), 500)
      : 50;

    const totalItems = await getProviderConnectionCount(baseFilter);
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const connections = await getProviderConnections({
      ...baseFilter,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    const safeConnections = connections.map((c) => {
      const { providerSpecificData, ...rest } = c;
      // Keep only small, non-secret display fields from providerSpecificData.
      const psd = providerSpecificData || {};
      const display = {};
      for (const k of ["nodeName", "prefix", "apiType"]) {
        if (psd[k] !== undefined) display[k] = psd[k];
      }
      const clean = {
        ...rest,
        ...(Object.keys(display).length ? { providerSpecificData: display } : {}),
        apiKey: undefined,
        accessToken: undefined,
        refreshToken: undefined,
        idToken: undefined,
      };
      for (const k of Object.keys(clean)) {
        if (k.startsWith("modelLock_")) delete clean[k];
      }
      return enrich(clean);
    });

    return NextResponse.json({
      connections: safeConnections,
      ...(stats ? { stats } : {}),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.log("Error fetching providers:", error);
    return NextResponse.json({ error: "Failed to fetch providers" }, { status: 500 });
  }
}

// POST /api/providers - Create new connection (API Key only, OAuth via separate flow)
export async function POST(request) {
  try {
    const body = await request.json();
    const provider = normalizeProviderId(body.provider);
    const { apiKey, name, displayName, priority, globalPriority, defaultModel, testStatus } = body;
    const proxyConfig = normalizeProxyConfig(body);
    if (proxyConfig.error) {
      return NextResponse.json({ error: proxyConfig.error }, { status: 400 });
    }

    const proxyPoolResult = await normalizeProxyPoolId(body.proxyPoolId);
    if (proxyPoolResult.error) {
      return NextResponse.json({ error: proxyPoolResult.error }, { status: 400 });
    }
    const proxyPoolId = proxyPoolResult.proxyPoolId;

    // Validation
    const isWebCookieProvider = !!WEB_COOKIE_PROVIDERS[provider];
    // Dual-auth providers (e.g. codebuddy-cn, xai) live under category "oauth" but also
    // accept an API key via authModes — they aren't in APIKEY_PROVIDERS, so allow them here.
    const supportsApiKeyMode = !!AI_PROVIDERS[provider]?.authModes?.includes("apikey");
    const isValidProvider = APIKEY_PROVIDERS[provider] ||
      FREE_TIER_PROVIDERS[provider] ||
      supportsApiKeyMode ||
      isWebCookieProvider ||
      isOpenAICompatibleProvider(provider) ||
      isAnthropicCompatibleProvider(provider) ||
      isCustomEmbeddingProvider(provider);

    if (!provider || !isValidProvider) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }
    if (!apiKey && provider !== "ollama-local") {
      return NextResponse.json({ error: `${isWebCookieProvider ? "Cookie value" : "API Key"} is required` }, { status: 400 });
    }
    const connectionName = name || displayName || AI_PROVIDERS[provider]?.name;
    if (!connectionName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    let providerSpecificData = normalizeProviderSpecificData(provider, body, body.providerSpecificData);

    // Compatible LLM nodes support multiple API-key connections (key pool); runtime
    // rotates/fails over via getProviderCredentials. Embedding nodes stay single-connection.
    if (isOpenAICompatibleProvider(provider)) {
      const node = await getProviderNodeById(provider);
      if (!node) {
        return NextResponse.json({ error: "OpenAI Compatible node not found" }, { status: 404 });
      }
      providerSpecificData = {
        prefix: node.prefix,
        apiType: node.apiType,
        baseUrl: node.baseUrl,
        nodeName: node.name,
        ...(typeof node.userAgent === "string" && node.userAgent.trim() ? { userAgent: node.userAgent.trim() } : {}),
        ...(Number(node.timeoutMs) > 0 ? { timeoutMs: Math.floor(Number(node.timeoutMs)) } : {}),
        ...(node.customHeaders && typeof node.customHeaders === "object" ? { customHeaders: { ...node.customHeaders } } : {}),
      };
    } else if (isAnthropicCompatibleProvider(provider)) {
      const node = await getProviderNodeById(provider);
      if (!node) {
        return NextResponse.json({ error: "Anthropic Compatible node not found" }, { status: 404 });
      }
      providerSpecificData = {
        prefix: node.prefix,
        baseUrl: node.baseUrl,
        nodeName: node.name,
        ...(typeof node.userAgent === "string" && node.userAgent.trim() ? { userAgent: node.userAgent.trim() } : {}),
        ...(Number(node.timeoutMs) > 0 ? { timeoutMs: Math.floor(Number(node.timeoutMs)) } : {}),
        ...(node.customHeaders && typeof node.customHeaders === "object" ? { customHeaders: { ...node.customHeaders } } : {}),
      };
    } else if (isCustomEmbeddingProvider(provider)) {
      const node = await getProviderNodeById(provider);
      if (!node) {
        return NextResponse.json({ error: "Custom Embedding node not found" }, { status: 404 });
      }
      providerSpecificData = {
        prefix: node.prefix,
        baseUrl: node.baseUrl,
        nodeName: node.name,
      };
    }

    const mergedProviderSpecificData = {
      ...(providerSpecificData || {}),
      connectionProxyEnabled: proxyConfig.connectionProxyEnabled,
      connectionProxyUrl: proxyConfig.connectionProxyUrl,
      connectionNoProxy: proxyConfig.connectionNoProxy,
    };

    // Custom per-connection request headers and User-Agent (any provider type).
    // Sanitized via the shared runtime helper (reserved auth/host headers refused).
    if (body.customHeaders && typeof body.customHeaders === "object" && !Array.isArray(body.customHeaders)) {
      const clean = applyCustomHeaders({}, body.customHeaders);
      if (Object.keys(clean).length > 0) mergedProviderSpecificData.customHeaders = clean;
    }
    if (typeof body.userAgent === "string" && body.userAgent.trim()) {
      mergedProviderSpecificData.userAgent = body.userAgent.trim();
    }

    if (proxyPoolId !== null) {
      mergedProviderSpecificData.proxyPoolId = proxyPoolId;
    }

    const newConnection = await createProviderConnection({
      provider,
      authType: isWebCookieProvider ? "cookie" : "apikey",
      name: connectionName,
      apiKey: apiKey || "",
      priority: priority || 1,
      globalPriority: globalPriority || null,
      defaultModel: defaultModel || null,
      providerSpecificData: mergedProviderSpecificData,
      isActive: true,
      testStatus: testStatus || "unknown",
    });

    // Hide sensitive fields
    const result = { ...newConnection };
    delete result.apiKey;

    return NextResponse.json({ connection: result }, { status: 201 });
  } catch (error) {
    console.log("Error creating provider:", error);
    return NextResponse.json({ error: "Failed to create provider" }, { status: 500 });
  }
}
