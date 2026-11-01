import { normalizeNousFreeModels } from "open-sse/services/nous.js";

// Free OpenCode models that don't use the "-free" id suffix
const KNOWN_FREE_OPENCODE_MODELS = ["big-pickle"];

// The free catalog rotates: a model retired today can be served again tomorrow
// (`nemotron-3-ultra-free` is served while absent from the catalog). Nothing may therefore
// stay permanently hidden, so every entry carries the date it was verified and expires.
// Muse Spark is deliberately not listed — its 410 is months old and the family must be
// retryable; the live status check reports it instead of a permanent block.
const DEAD_FREE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const DEAD_FREE_OPENCODE_MODELS = new Map([
  ["deepseek-v4-flash-free", "2026-10-25"],
  ["mimo-v2.5-free", "2026-10-25"],
  ["ling-3.0-flash-fin-free", "2026-10-25"],
]);

function isDeadFreeOpencodeModel(id) {
  const checkedAt = DEAD_FREE_OPENCODE_MODELS.get(id);
  if (!checkedAt) return false;
  return Date.now() - Date.parse(checkedAt) < DEAD_FREE_TTL_MS;
}

export const FILTERS = {
  "nous-free": normalizeNousFreeModels,
  "openrouter-free": (models) =>
    models
      .filter(
        (m) =>
          m.pricing?.prompt === "0" &&
          m.pricing?.completion === "0" &&
          m.context_length >= 200000
      )
      .map((m) => ({ id: m.id, name: m.name, contextLength: m.context_length }))
      .sort((a, b) => b.contextLength - a.contextLength),

  "opencode-free": (models) =>
    models
      .filter((m) => (m.id?.endsWith("-free") || KNOWN_FREE_OPENCODE_MODELS.includes(m.id)) && !isDeadFreeOpencodeModel(m.id))
      .map((m) => ({ id: m.id, name: m.id })),

  // models.dev returns a large catalog; keep only mimo models
  "mimo-free": (models) =>
    (Array.isArray(models) ? models : [])
      .filter((m) => m.id?.startsWith("mimo") || m.name?.toLowerCase().includes("mimo"))
      .map((m) => ({ id: m.id, name: m.name || m.id })),

  "airforce-free": (models) =>
    (Array.isArray(models) ? models : [])
      .filter((m) => (m.tier === "free" || m.id?.endsWith(":free")) && m.supports_chat === true && (!m.media_type || m.media_type === "chat" || m.media_type === "text"))
      .map((m) => ({ id: m.id, name: m.name || m.id, contextLength: m.context_length }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),

  // Upstream catalog shapes vary (OpenAI pricing, :free suffix, isFree flag) —
  // accept any free signal rather than assuming one schema.
  "tokenharbor-free": (models) =>
    (Array.isArray(models) ? models : [])
      .filter(
        (m) =>
          m.isFree === true ||
          String(m.id || "").endsWith(":free") ||
          (m.pricing && String(m.pricing.prompt ?? "") === "0" && String(m.pricing.completion ?? "") === "0")
      )
      .map((m) => ({ id: m.id, name: m.name || m.id, contextLength: m.context_length }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),

  // B.AI catalog: keep zero-cost models (string or numeric pricing).
  "bai-free": (models) =>
    (Array.isArray(models) ? models : [])
      .filter(
        (m) =>
          m &&
          (m.isFree === true ||
            (m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0))
      )
      .map((m) => ({ id: m.id, name: m.name || m.id, contextLength: m.context_length }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),

  // AgentRouter has no free tier split — expose the whole catalog.
  "agentrouter-all": (models) =>
    (Array.isArray(models) ? models : [])
      .filter((m) => m && typeof m.id === "string" && m.id.trim() !== "")
      .map((m) => ({ id: m.id, name: m.name || m.id, contextLength: m.context_length }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
};
