import { AI_PROVIDERS, getProviderAlias, isAnthropicCompatibleProvider, isOpenAICompatibleProvider } from "@/shared/constants/providers";

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
