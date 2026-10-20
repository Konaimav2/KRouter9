import { PROVIDER_MODELS } from "open-sse/config/providerModels.js";
import { AI_PROVIDERS, ALIAS_TO_ID } from "@/shared/constants/providers";
import { getModelKind } from "@/shared/constants/models";
import { buildModelsList } from "@/app/api/v1/models/route.js";
import { getProviderConnections } from "@/lib/localDb";
import { authorizeModelCatalog, isCatalogModelAllowed, modelCatalogJson, modelCatalogNotFound } from "@/lib/modelCatalogAccess.js";

const KIND_ENDPOINT = {
  llm: "/v1/chat/completions",
  image: "/v1/images/generations",
  tts: "/v1/audio/speech",
  stt: "/v1/audio/transcriptions",
  embedding: "/v1/embeddings",
  imageToText: "/v1/chat/completions",
  webSearch: "/v1/search",
  webFetch: "/v1/fetch",
};

const TTS_VOICES_API = new Set(["elevenlabs", "edge-tts", "deepgram", "inworld", "local-device"]);

function buildInfo({ alias, providerId, model, kind, providerInfo }) {
  const out = {
    id: `${alias}/${model.id}`,
    name: model.name || model.id,
    kind,
    owned_by: alias,
    endpoint: KIND_ENDPOINT[kind] || null,
  };
  if (model.params) out.params = model.params;
  if (model.capabilities) out.capabilities = model.capabilities;
  if (model.options) out.options = model.options;
  if (model.dimensions) out.dimensions = model.dimensions;
  if (model.contextWindow) out.contextWindow = model.contextWindow;
  if (kind === "tts" && TTS_VOICES_API.has(providerId)) {
    out.voicesUrl = `/v1/audio/voices?provider=${providerId}`;
  }
  if (kind === "webSearch" && providerInfo?.searchConfig) {
    const cfg = providerInfo.searchConfig;
    if (cfg.searchTypes) out.searchTypes = cfg.searchTypes;
    if (cfg.maxMaxResults) out.maxResults = cfg.maxMaxResults;
    if (cfg.requiredOptions) out.required = cfg.requiredOptions;
  }
  return out;
}

// id format: "{alias}/{modelId}" - alias may also be providerId
// requestedKind: optional, disambiguates duplicate ids across kinds (e.g. gemini-2.5-pro llm vs stt)
function lookup(fullId, requestedKind) {
  if (!fullId || !fullId.includes("/")) return null;
  const slash = fullId.indexOf("/");
  const alias = fullId.slice(0, slash);
  const modelId = fullId.slice(slash + 1);
  const providerId = ALIAS_TO_ID[alias] || alias;
  const providerInfo = AI_PROVIDERS[providerId];

  // PROVIDER_MODELS lookup (by alias key, fallback to providerId)
  const list = PROVIDER_MODELS[alias] || PROVIDER_MODELS[providerId] || [];
  const m = requestedKind
    ? list.find((x) => x.id === modelId && getModelKind(x, "llm") === requestedKind)
    : list.find((x) => x.id === modelId);
  if (m) {
    const kind = getModelKind(m, "llm");
    return buildInfo({ alias, providerId, model: m, kind, providerInfo });
  }

  // Web search/fetch — virtual model id "search" / "fetch"
  if (modelId === "search" && providerInfo?.searchConfig) {
    return buildInfo({
      alias, providerId, kind: "webSearch", providerInfo,
      model: { id: "search", name: `${providerInfo.name} Search`, params: ["query", "max_results", "country", "language", "time_range", "domain_filter", "search_type"] },
    });
  }
  if (modelId === "fetch" && providerInfo?.fetchConfig) {
    return buildInfo({
      alias, providerId, kind: "webFetch", providerInfo,
      model: { id: "fetch", name: `${providerInfo.name} Fetch`, params: ["url", "format", "max_characters"] },
    });
  }
  return null;
}

export async function OPTIONS() {
  return new Response(null, {
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}

// GET /v1/models/info?id={alias}/{modelId} — metadata for a single model
export async function GET(request) {
  const access = await authorizeModelCatalog(request);
  if (access.response) return access.response;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const kind = searchParams.get("kind");
    if (!id) {
      return modelCatalogJson(
        { error: { message: "Missing required query param: id (e.g. ?id=openai/dall-e-3)", type: "invalid_request_error" } },
        access,
        { status: 400 },
      );
    }
    if (!isCatalogModelAllowed(access, id)) return modelCatalogNotFound(access);
    const alias = id.split("/", 1)[0];
    const codexConnections = (await getProviderConnections())
      .filter((conn) => conn.provider === "codex" && conn.isActive !== false);
    const codexPrefixes = new Set(codexConnections.map((conn) => conn.providerSpecificData?.prefix?.trim() || "cx"));
    const isCodex = alias === "cx" || alias === "codex" || codexPrefixes.has(alias);
    // Codex OAuth is account-scoped: the static registry is neither an entitlement list
    // nor an authoritative source for this account's context window.
    if (isCodex && (!kind || kind === "llm")) {
      const lookupId = alias === "codex" ? `cx/${id.slice(alias.length + 1)}` : id;
      const models = await buildModelsList(["llm"]);
      const live = models.find((model) => model.id === lookupId)
        || ((alias === "codex" || alias === "cx") && models.find((model) =>
          codexPrefixes.has(model.owned_by) && model.id === `${model.owned_by}/${id.slice(alias.length + 1)}`));
      if (live && isCatalogModelAllowed(access, live.id)) return modelCatalogJson({ ...live, name: id.slice(alias.length + 1), kind: "llm", endpoint: KIND_ENDPOINT.llm }, access);
      return modelCatalogNotFound(access);
    }
    const info = lookup(id, kind);
    if (!info || !isCatalogModelAllowed(access, info.id)) return modelCatalogNotFound(access);
    return modelCatalogJson(info, access);
  } catch {
    return modelCatalogJson({ error: { message: "Failed to fetch model info", type: "server_error" } }, access, { status: 500 });
  }
}
