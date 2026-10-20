// Pricing lookup ported from srouter packages/pricing (seaavey/SRouter, MIT)
// Data: open-sse/config/pricing-data/pricing.jsonc (JSONC — comments stripped at load)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let cache = null;
function loadPricing() {
  if (cache) return cache;
  try {
    const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../config/pricing-data/pricing.jsonc"), "utf8");
    const json = raw.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const data = JSON.parse(json);
    // The bundled catalog groups rows by provider; retain flat-catalog support.
    cache = data.models
      ? Object.fromEntries(Object.values(data.models).flat().map((row) => [row.id, row]))
      : data;
  } catch { cache = {}; }
  return cache;
}

// Returns { input, output } per-1M-token USD prices for a model id, or null.
export function getModelPricing(modelId) {
  if (!modelId) return null;
  const data = loadPricing();
  const normalized = String(modelId).toLowerCase();
  const keys = Object.keys(data);
  const stem = normalized.replace(/-(?:[0-9]{8}|[0-9]{4})$/, "");
  const key = keys.find(k => k.toLowerCase() === normalized) ||
    (stem !== normalized && keys.find(k => k.toLowerCase() === stem));
  if (!key) return null;
  const e = data[key];
  return { input: e.input ?? e.inputPrice ?? null, output: e.output ?? e.outputPrice ?? null, raw: e };
}

export function invalidatePricingCache() { cache = null; }
