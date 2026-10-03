import { AI_PROVIDERS, getProviderAlias, isAnthropicCompatibleProvider, isOpenAICompatibleProvider } from "@/shared/constants/providers";
import { PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";

function humanize(value = "") {
  return String(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || "Unknown";
}

export function getProviderLabel(connection) {
  return connection?.name || humanize(connection?.provider || connection?.id || "provider");
}

// Picker group label — per PROVIDER, never per key (U1). Compatible nodes show
// the node name; built-ins show the registry display name. Key names must not
// leak into the picker.
export function getProviderGroupLabel(connection, providerId) {
  const id = providerId || connection?.provider || connection?.id || "";
  const psd = connection?.providerSpecificData || {};
  if (isOpenAICompatibleProvider(id) || isAnthropicCompatibleProvider(id)) {
    return psd.nodeName || psd.prefix || humanize(id);
  }
  return AI_PROVIDERS?.[id]?.name || humanize(id);
}

export function requestPrefixFor(connection) {
  const providerId = connection.provider || connection.id;
  if (isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId)) {
    return connection.providerSpecificData?.prefix || providerId;
  }
  return getProviderAlias(providerId);
}

export function normalizeStaticModel(model, connection) {
  if (!model?.id) return null;
  const requestModel = `${requestPrefixFor(connection)}/${model.id}`;
  return {
    id: requestModel,
    requestModel,
    name: model.name || model.id,
    providerId: connection.provider,
    providerName: getProviderLabel(connection),
    source: "static",
  };
}

export function normalizeLiveModel(model, connection) {
  const rawId = typeof model === "string" ? model : model?.id || model?.name || model?.model || "";
  if (!rawId) return null;

  const displayName = typeof model === "string"
    ? model
    : model?.name || model?.displayName || rawId;

  // Always emit a fully-qualified requestModel (alias/prefix + id), mirroring
  // ModelSelectModal and the /v1/models canonical shape.
  const prefix = requestPrefixFor(connection);
  const providerId = connection.provider || connection.id;
  let requestModel;
  if (rawId === prefix || rawId.startsWith(`${prefix}/`)) {
    requestModel = rawId;
  } else if (rawId === providerId || rawId.startsWith(`${providerId}/`)) {
    requestModel = `${prefix}${rawId.slice(providerId.length)}`;
  } else if (rawId.includes("/")) {
    requestModel = `${prefix}/${rawId.split("/").pop()}`;
  } else {
    requestModel = `${prefix}/${rawId}`;
  }

  return {
    id: requestModel,
    requestModel,
    name: displayName,
    providerId: connection.provider,
    providerName: getProviderLabel(connection),
    source: "live",
  };
}

export function dedupeModels(models) {
  const map = new Map();
  for (const model of models) {
    if (!model?.id) continue;
    if (!map.has(model.id)) map.set(model.id, model);
  }
  return Array.from(map.values());
}

// Filter picker groups by free-text query (W08). Matches model name,
// requestModel, and provider name case-insensitively; drops groups left empty.
// Pure (no state) so the menu stays a trivial render of its output.
export function filterModelGroups(groups, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return Array.isArray(groups) ? groups : [];
  const out = [];
  for (const group of groups || []) {
    if (!group || !Array.isArray(group.models)) continue;
    if (String(group.providerName || "").toLowerCase().includes(q)) {
      out.push(group);
      continue;
    }
    const models = group.models.filter(
      (m) =>
        String(m?.name || "").toLowerCase().includes(q) ||
        String(m?.requestModel || "").toLowerCase().includes(q) ||
        String(m?.id || "").toLowerCase().includes(q)
    );
    if (models.length > 0) out.push({ ...group, models });
  }
  return out;
}

// Combos group for the playground picker. Combos live outside connections, so the
// connection-scoped picker sources (static catalogs, per-connection live fetch) can
// never surface them — this builds the group from the combos list instead.
// requestModel stays the BARE combo name: the server resolves combos before provider
// routing (handleChat combo path). Returns null when empty (caller filters it out).
export function buildComboGroup(combos) {
  const providerName = "Combos";
  const models = (Array.isArray(combos) ? combos : [])
    .filter((c) => c && typeof c.name === "string" && c.name.trim() !== "")
    .map((c) => ({
      id: c.name,
      requestModel: c.name,
      name: c.name,
      providerId: "combo",
      providerName,
      source: "combo",
      ...(c.kind ? { kind: c.kind } : {}),
    }));
  if (models.length === 0) return null;
  return {
    providerId: "combo",
    providerName,
    providerType: "combo",
    connections: [],
    models,
  };
}

// True when a curated id can never route to its provider: its bare tail
// (after the last "/") matches a combo name. `grip/<combo>` resolves via the
// combo path (handleChat getComboModels-first + tail strip in
// src/sse/services/model.js), never the grip connection; the bare combo
// entry already advertises the combo. Pure so both /v1/models and the
// playground picker share one predicate (F04 single-source).
export function isComboShadowed(modelId, comboNames) {
  if (!modelId || !comboNames || comboNames.size === 0) return false;
  const tail = String(modelId).split("/").pop().trim();
  if (!tail) return false;
  return comboNames.has(tail);
}

function modelType(model) {
  return model?.kind || model?.type || "llm";
}

// Single-source curated selector: the exact per-connection curated pool
// /v1/models merges (custom store + legacy aliases, triple-alias predicate),
// keyed by any of the three aliases the route matches (output/legacy prefix,
// static registry alias, raw node/provider id). Returns bare ids plus the
// connection's display (output) alias for qualification. `type` mirrors the
// route: llm-listed custom rows keep imageToText members (vision-capable chat
// models stay in the LLM list).
export function selectConnectionCuratedIds(customModels, modelAliases, connection, type = "llm") {
  const providerId = connection?.provider || connection?.id || "";
  const psd = connection?.providerSpecificData || {};
  const staticAlias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
  const outputAlias = String(
    psd?.prefix || getProviderAlias(providerId) || staticAlias || ""
  ).trim();
  const ids = [];
  const seen = new Set();

  for (const m of customModels || []) {
    if (!m?.id) continue;
    const alias = m.providerAlias;
    if (alias !== outputAlias && alias !== staticAlias && alias !== providerId) continue;
    const kind = modelType(m);
    const allowAsLlm = type === "llm" && kind === "imageToText";
    if (type && kind !== type && !allowAsLlm) continue;
    const id = String(m.id).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push({
      id,
      name: m.name || id,
      source: m.source || "custom",
    });
  }

  for (const [aliasName, fullModel] of Object.entries(modelAliases || {})) {
    if (typeof fullModel !== "string" || !fullModel.includes("/")) continue;
    if (
      !fullModel.startsWith(`${outputAlias}/`) &&
      !fullModel.startsWith(`${staticAlias}/`) &&
      !fullModel.startsWith(`${providerId}/`)
    ) continue;
    const id = String(fullModel.split("/").pop() || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push({ id, name: aliasName || id, source: "legacyAlias", alias: aliasName });
  }

  return { ids, outputAlias, staticAlias, providerId };
}

// Normalize one curated bare id to the fully-qualified picker entry — the
// same `{prefix}/{id}` shape normalizeLiveModel emits and /v1/models lists.
export function normalizeCuratedModel(entry, connection, outputAlias) {
  const rawId = typeof entry === "string" ? entry : entry?.id;
  if (!rawId) return null;
  const alias = outputAlias || connection?.providerSpecificData?.prefix || connection?.provider || connection?.id || "";
  const name = typeof entry === "string" ? entry : entry?.name || rawId;
  const source = typeof entry === "string" ? "custom" : entry?.source || "custom";
  return {
    id: `${alias}/${rawId}`,
    requestModel: `${alias}/${rawId}`,
    name,
    providerId: connection?.provider,
    providerName: getProviderLabel(connection),
    source,
  };
}
