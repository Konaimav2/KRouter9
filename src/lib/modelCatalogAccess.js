import { getApiKeyByKey, validateApiKey } from "@/lib/db/repos/apiKeysRepo.js";
import { isModelAllowedForKey } from "@/lib/apiKeyPolicy.js";
import { extractApiKey } from "@/lib/apiKeyCredentials.js";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export function modelCatalogJson(data, access, options = {}) {
  return Response.json(data, {
    ...options,
    headers: {
      "Access-Control-Allow-Origin": "*",
      ...options.headers,
      ...access?.headers,
    },
  });
}

export function modelCatalogNotFound(access) {
  return modelCatalogJson({ error: {
    message: "The model does not exist or you do not have access to it.",
    type: "invalid_request_error", code: "model_not_found",
  } }, access, { status: 404 });
}

export async function authorizeModelCatalog(request) {
  const key = extractApiKey(request);
  // HTTP no-key admission belongs to dashboardGuard (trusted local/CLI only).
  // Requestless calls retain the internal global builder/test contract.
  if (key == null) return { keyRow: null, headers: {} };
  const access = { keyRow: null, headers: PRIVATE_HEADERS };
  try {
    const row = await getApiKeyByKey(key);
    if (!row?.isActive || !await validateApiKey(key)) {
      access.response = modelCatalogJson({ error: { message: "Invalid API key", type: "authentication_error" } }, access, { status: 401 });
      return access;
    }
    access.keyRow = row;
  } catch {
    access.response = modelCatalogJson({ error: { message: "API key lookup unavailable", type: "server_error" } }, access, { status: 503 });
  }
  return access;
}

export function isCatalogModelAllowed(access, id) {
  return !access.keyRow || isModelAllowedForKey(access.keyRow, id);
}

export function filterModelCatalog(models, access) {
  return models.filter((model) => isCatalogModelAllowed(access, model.id));
}
