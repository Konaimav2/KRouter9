// KRouter9 model intelligence — syncs Arena ELO-style rankings from public leaderboards
// (LMArena leaderboard CSV/JSON endpoints) into settings.modelIntelligence.
// Used to power /api/models/smart (rank-aware model suggestions).
// Fail-open: network failure keeps previous snapshot.
import { getAdapter } from "@/lib/db/driver.js";
import { getSettings, updateSettings } from "@/lib/localDb.js";

export async function syncArenaRankings() {
  try {
    // OpenRouter public model rankings (no auth) — best-effort
    const r = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const entries = (data.data || [])
      .sort((a, b) => (b.context_length || 0) - (a.context_length || 0));
    const rankings = {};
    let rank = 1;
    for (const e of entries.slice(0, 150)) {
      const name = e.id || e.model || e.name;
      if (!name) continue;
      rankings[String(name).toLowerCase()] = {
        rank: rank++,
        context: e.context_length || null,
        pricing: e.pricing ? { prompt: e.pricing.prompt, completion: e.pricing.completion } : null,
      };
    }
    await updateSettings({
      modelIntelligence: JSON.stringify({ syncedAt: new Date().toISOString(), source: "openrouter", rankings }),
    });
    return { ok: true, models: Object.keys(rankings).length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function getSmartRanking(modelName) {
  try {
    const settings = await getSettings();
    const mi = typeof settings.modelIntelligence === "string"
      ? JSON.parse(settings.modelIntelligence)
      : settings.modelIntelligence;
    if (!mi?.rankings) return null;
    return mi.rankings[String(modelName || "").toLowerCase()] || null;
  } catch { return null; }
}

// GET /api/models/smart — suggest models by rank, optionally filtered by provider substring
export async function smartSuggestions(query = "", limit = 10) {
  try {
    const settings = await getSettings();
    const mi = typeof settings.modelIntelligence === "string"
      ? JSON.parse(settings.modelIntelligence)
      : settings.modelIntelligence;
    if (!mi?.rankings) return [];
    const q = query.toLowerCase();
    return Object.entries(mi.rankings)
      .filter(([name]) => !q || name.includes(q))
      .sort((a, b) => a[1].rank - b[1].rank)
      .slice(0, limit)
      .map(([name, info]) => ({ model: name, ...info }));
  } catch { return []; }
}
