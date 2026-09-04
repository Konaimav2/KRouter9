// models.dev catalog sync — KRouter9 minimal (OmniRoute concept).
// Fetches https://models.dev/api.json, caches to disk, exposes provider/model lookup.
// Fail-open: network errors return cached (or empty) data.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const URL = "https://models.dev/api.json";
const CACHE_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../data/models-dev-cache.json");
let mem = null;

export async function fetchModelsDev(signal) {
  try {
    const r = await fetch(URL, { signal });
    if (!r.ok) throw new Error(`models.dev HTTP ${r.status}`);
    mem = await r.json();
    try { mkdirSync(join(CACHE_PATH, ".."), { recursive: true }); writeFileSync(CACHE_PATH, JSON.stringify(mem)); } catch (_e) {}
    return mem;
  } catch {
    if (mem) return mem;
    try { mem = JSON.parse(readFileSync(CACHE_PATH, "utf8")); return mem; } catch (_e) {}
    return {};
  }
}

export function getModelsDevCatalog() { return mem || {}; }

// Returns [{ provider, id, name }] matching a query string across the catalog.
export function searchModelsDev(query) {
  const q = String(query || "").toLowerCase();
  const out = [];
  const data = mem || {};
  for (const [prov, pdata] of Object.entries(data)) {
    const models = pdata?.models || {};
    for (const [id, m] of Object.entries(models)) {
      if (!q || id.toLowerCase().includes(q) || String(m?.name || "").toLowerCase().includes(q)) {
        out.push({ provider: prov, id, name: m?.name || id });
      }
    }
  }
  return out.slice(0, 100);
}
