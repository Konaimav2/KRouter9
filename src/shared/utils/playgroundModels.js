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
