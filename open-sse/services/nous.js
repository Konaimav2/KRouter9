import { NOUS_CHAT_COMPLETIONS_URL, NOUS_VALIDATION_MODEL } from "../providers/registry/nous.js";
import { ROLE } from "../translator/schema/roles.js";

export {
  NOUS_PROVIDER_ID, NOUS_INFERENCE_BASE_URL, NOUS_CHAT_COMPLETIONS_URL,
  NOUS_MODELS_URL, NOUS_PORTAL_BASE_URL, NOUS_DEVICE_CODE_URL, NOUS_TOKEN_URL,
  NOUS_AGENT_KEY_URL, NOUS_OAUTH_CLIENT_ID, NOUS_OAUTH_SCOPE, NOUS_VALIDATION_MODEL,
} from "../providers/registry/nous.js";

const asPositiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
const isTextCapable = (model) => {
  const modalities = model?.architecture?.output_modalities;
  return !Array.isArray(modalities) || modalities.length === 0 || modalities.includes("text");
};
const getRawModels = (payload) => {
  const models = Array.isArray(payload) ? payload : payload?.data || payload?.models || payload?.results || [];
  return Array.isArray(models) ? models : [];
};
const isZeroPrice = (value) => value !== null && value !== undefined && Number(value) === 0;

// The public catalog also contains embeddings and image-only models, not chat.
export function normalizeNousModels(payload) {
  return getRawModels(payload).filter(isTextCapable).map((model) => {
    const id = typeof model?.id === "string" ? model.id.trim() : "";
    if (!id) return null;
    const contextLength = asPositiveInteger(model.context_length ?? model.top_provider?.context_length);
    const maxOutputTokens = asPositiveInteger(model.top_provider?.max_completion_tokens);
    return {
      id, name: model.name || id,
      ...(contextLength ? { contextLength } : {}),
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      ...(model.description ? { description: model.description } : {}),
    };
  }).filter(Boolean).sort((a, b) => Number(!a.id.startsWith("nousresearch/")) - Number(!b.id.startsWith("nousresearch/")));
}

export function normalizeNousFreeModels(payload) {
  return normalizeNousModels(getRawModels(payload).filter((model) =>
    isTextCapable(model) && isZeroPrice(model?.pricing?.prompt) && isZeroPrice(model?.pricing?.completion)
    && asPositiveInteger(model?.context_length ?? model?.top_provider?.context_length) >= 200000
  )).sort((a, b) => (b.contextLength || 0) - (a.contextLength || 0));
}

// /models is public; only successful inference proves credential acceptance.
export function createNousApiKeyProbe(apiKey) {
  return {
    url: NOUS_CHAT_COMPLETIONS_URL,
    options: {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: NOUS_VALIDATION_MODEL, messages: [{ role: ROLE.USER, content: "ping" }], max_tokens: 1, stream: false }),
    },
  };
}
export function isNousApiKeyAccepted(status) {
  return status >= 200 && status < 300;
}
export function getNousApiKeyValidationError(status) {
  return status === 401 || status === 403
    ? "Invalid or inactive API key"
    : `Unable to verify API key (Nous returned ${status})`;
}
