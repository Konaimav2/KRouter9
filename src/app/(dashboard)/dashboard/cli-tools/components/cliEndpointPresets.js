import { getGatewayOrigin } from "@/shared/utils/gatewayOrigin";

// Browser-local endpoint preset store shared by every CLI tool card
function createStore({ storageKey, changeEvent, itemField, normalize = (v) => v, defaultName = (v) => v }) {
  const read = () => {
    if (typeof window === "undefined") return [];
    try {
      const raw = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.filter((p) => p?.name && p?.[itemField]);
    } catch {
      return [];
    }
  };

  const write = (items) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(changeEvent));
  };

  return {
    read,
    subscribe: (handler) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener(changeEvent, handler);
      return () => window.removeEventListener(changeEvent, handler);
    },
    // Adds or replaces a preset; returns the stored name, or null when skipped
    upsert: (value, name) => {
      const v = normalize(value);
      if (!v) return null;

      const items = read();
      const existing = items.find((p) => normalize(p[itemField]) === v);
      if (existing && !name) return existing.name;

      const finalName = (name || defaultName(v)).trim();
      if (!finalName) return null;

      const next = [...items.filter((p) => p.name !== finalName && normalize(p[itemField]) !== v), { name: finalName, [itemField]: v }]
        .sort((a, b) => a.name.localeCompare(b.name));
      write(next);
      return finalName;
    },
    remove: (name) => write(read().filter((p) => p.name !== name)),
  };
}

const stripSlash = (url) => (url || "").replace(/\/+$/, "");

const endpoints = createStore({
  storageKey: "krouter9.cliToolEndpointPresets",
  changeEvent: "krouter9:endpoint-presets-changed",
  itemField: "baseUrl",
  normalize: stripSlash,
  defaultName: (url) => {
    try { return new URL(url).host; } catch { return url; }
  },
});

// API key presets never hold a secret. An entry is { name, label }: a
// required user-chosen name and a masked label. A raw key is never written to
// localStorage, never used as a name, and never used as a label; reusable keys
// belong on the Keys page (stored gateway keys, selected by id).
const KEY_PRESETS_STORAGE = "krouter9.cliToolApiKeyPresets";
const KEY_PRESETS_EVENT = "krouter9:api-key-presets-changed";

// Masked label for a typed key: last four characters at most, and only when
// the key is long enough that four characters reveal little.
export function maskKeyLabel(value) {
  const v = String(value || "").trim();
  if (v.length < 12) return "••••";
  return `••••${v.slice(-4)}`;
}

function writeKeyPresets(items) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_PRESETS_STORAGE, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(KEY_PRESETS_EVENT));
}

// One-time cleanup of the legacy { name, key } shape. Only the name survives,
// and only when it is not the key itself (unnamed presets used the raw key as
// their name). Rewrites storage once; later reads find nothing to migrate.
function migrateLegacyKeyPresets(raw) {
  let changed = false;
  const out = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") { changed = true; continue; }
    const legacyKey = typeof p.key === "string" ? p.key.trim() : "";
    if ("key" in p) changed = true;
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!name) { changed = true; continue; }
    // A name that is, contains, or is a long fragment of the key is secret.
    if (legacyKey && (name.includes(legacyKey) || (name.length >= 8 && legacyKey.includes(name)))) continue;
    const label = legacyKey ? maskKeyLabel(legacyKey) : (typeof p.label === "string" ? p.label : "");
    out.push({ name, label });
  }
  return { items: out, changed };
}

export function readKeyPresets() {
  if (typeof window === "undefined") return [];
  let raw;
  try {
    raw = JSON.parse(window.localStorage.getItem(KEY_PRESETS_STORAGE) || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const { items, changed } = migrateLegacyKeyPresets(raw);
  if (changed) {
    try {
      window.localStorage.setItem(KEY_PRESETS_STORAGE, JSON.stringify(items));
    } catch {
      // Storage unavailable: the in-memory result is still clean.
    }
  }
  return items;
}

export function subscribeKeyPresets(handler) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(KEY_PRESETS_EVENT, handler);
  return () => window.removeEventListener(KEY_PRESETS_EVENT, handler);
}

// Saves a named entry with a masked label. A name is required; the raw value
// only feeds the masked label and is never stored. Returns the name or null.
export function upsertKeyPreset(value, name) {
  const finalName = String(name || "").trim();
  if (!finalName) return null;
  const label = maskKeyLabel(value);
  const v = String(value || "").trim();
  if (v && (finalName === v || finalName.includes(v))) return null;
  const next = [...readKeyPresets().filter((p) => p.name !== finalName), { name: finalName, label }]
    .sort((a, b) => a.name.localeCompare(b.name));
  writeKeyPresets(next);
  return finalName;
}

export function deleteKeyPreset(name) {
  writeKeyPresets(readKeyPresets().filter((p) => p.name !== name));
}

export const readPresets = endpoints.read;
export const subscribePresets = endpoints.subscribe;
export const upsertPreset = endpoints.upsert;
export const deletePreset = endpoints.remove;


// Save an applied endpoint unless it exactly matches a built-in dropdown option
export function rememberEndpoint(baseUrl, { tunnelPublicUrl, tailscaleUrl, cloudUrl } = {}) {
  const url = stripSlash(baseUrl);
  if (!url) return null;

  const builtIns = [getGatewayOrigin({ loopback: true }), tunnelPublicUrl, tailscaleUrl, cloudUrl]
    .filter(Boolean)
    .flatMap((u) => [stripSlash(u), `${stripSlash(u)}/v1`]);
  if (builtIns.includes(url)) return null;

  return upsertPreset(url);
}

export { stripSlash };
