import { buildModelsList } from "../route.js";
import { getComboByName } from "@/lib/localDb";
import { authorizeModelCatalog, filterModelCatalog, isCatalogModelAllowed, modelCatalogJson, modelCatalogNotFound } from "@/lib/modelCatalogAccess.js";

// URL slug → service kind(s). `web` covers both webSearch and webFetch.
const KIND_SLUG_MAP = {
  "image": ["image"],
  "tts": ["tts"],
  "stt": ["stt"],
  "embedding": ["embedding"],
  "image-to-text": ["imageToText"],
  "web": ["webSearch", "webFetch"],
};

const LLM_KIND = "llm";

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * GET /v1/models/{kind} - OpenAI-compatible models list filtered by capability.
 * GET /v1/models/{provider}/{model} - OpenAI-compatible single model lookup.
 * Supported kinds: image, tts, stt, embedding, image-to-text, web.
 */
export async function GET(request, { params }) {
  const access = await authorizeModelCatalog(request);
  if (access.response) return access.response;
  try {
    const { model } = await params;
    const path = Array.isArray(model) ? model : [model];
    const identifier = path.filter(Boolean).join("/");
    const kindFilter = path.length === 1 ? KIND_SLUG_MAP[identifier] : null;

    if (kindFilter) {
      const data = await buildModelsList(kindFilter);
      return modelCatalogJson({ object: "list", data: filterModelCatalog(data, access) }, access);
    }

    if (!isCatalogModelAllowed(access, identifier)) return modelCatalogNotFound(access);

    // Match the same LLM catalog exposed by GET /v1/models. A catch-all
    // parameter is required because provider-prefixed IDs contain a slash.
    const models = await buildModelsList([LLM_KIND]);
    let matchedModel = models.find((candidate) => candidate.id === identifier);

    // Slug-qualified combo ("kiro/my-combo", legacy "kr/my-combo") or legacy
    // kiro alias ("kr/<model>"): resolve through the same chains chat uses.
    if (!matchedModel && identifier.includes("/")) {
      const tail = identifier.split("/").pop();
      const combo = await getComboByName(tail);
      if (combo) {
        matchedModel = { id: tail, object: "model", owned_by: "combo" };
      } else if (identifier.startsWith("kr/")) {
        const krTarget = identifier.slice(3);
        matchedModel = models.find((candidate) => candidate.id === `kiro/${krTarget}`);
      }
    }

    if (!matchedModel || !isCatalogModelAllowed(access, matchedModel.id)) return modelCatalogNotFound(access);

    return modelCatalogJson(matchedModel, access);
  } catch {
    return modelCatalogJson({ error: { message: "Failed to fetch model", type: "server_error" } }, access, { status: 500 });
  }
}
