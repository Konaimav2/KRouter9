// Semantic cache — KRouter9 minimal (OmniRoute concept).
// V1: normalized exact-match + TTL (no embeddings; upgrade path noted).
// Fail-open: any error returns { hit: false }.
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db/index.js";

const DEFAULT_TTL_MS = 3600_000;

function normalize(messages) {
  try {
    const arr = Array.isArray(messages) ? messages : [messages];
    return arr.map(m => {
      if (typeof m === "string") return m.trim().toLowerCase().replace(/\s+/g, " ");
      const c = m.content;
      const t = typeof c === "string" ? c : JSON.stringify(c || "");
      return `${m.role || ""}:${t.trim().toLowerCase().replace(/\s+/g, " ")}`;
    }).join("\n");
  } catch { return ""; }
}

export function cacheKey(model, messages) {
  return createHash("sha256").update(`${model}\n${normalize(messages)}`).digest("hex");
}

export function cacheGet(model, messages, ttlMs = DEFAULT_TTL_MS) {
  try {
    const db = getDb();
    const row = db.prepare("SELECT response, createdAt FROM semanticCache WHERE key = ?").get(cacheKey(model, messages));
    if (!row) return { hit: false };
    if (Date.now() - new Date(row.createdAt).getTime() > ttlMs) return { hit: false, stale: true };
    return { hit: true, response: JSON.parse(row.response) };
  } catch { return { hit: false }; }
}

export function cacheSet(model, messages, response) {
  try {
    const db = getDb();
    db.prepare("INSERT INTO semanticCache (key, model, response, createdAt) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET response=excluded.response, createdAt=excluded.createdAt")
      .run(cacheKey(model, messages), model, JSON.stringify(response), new Date().toISOString());
  } catch (_e) {}
}
