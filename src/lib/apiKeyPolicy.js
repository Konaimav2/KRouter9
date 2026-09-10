// KRouter9 per-key model allow/deny policy (pure, stdlib only).
// modelPolicy: 'off' | 'whitelist' | 'blacklist'
// - whitelist: only models listed in allowedModels pass
// - blacklist: models listed in blockedModels are rejected
// - off/unknown: everything passes (fail-open, existing keys keep working)
export function parseModelList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
  if (typeof v !== "string") return [];
  const t = v.trim();
  if (!t) return [];
  try {
    const j = JSON.parse(t);
    if (Array.isArray(j)) return j.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
  } catch { /* fall through to CSV */ }
  return t.split(",").map((x) => x.trim()).filter(Boolean);
}

// ponytail: exact + trailing-segment match (chat-side resolves "<slug>/<model>"
// prefixes, so "oc/m" must match policy entry "m" and vice versa).
function modelMatches(entry, model) {
  if (!entry || !model) return false;
  if (entry === model) return true;
  const e = entry.split("/").pop();
  const m = String(model).split("/").pop();
  return e === m;
}

export function isModelAllowedForKey(keyRow, model) {
  const policy = keyRow?.modelPolicy || "off";
  if (policy !== "whitelist" && policy !== "blacklist") return true;
  if (!model) return true;
  if (policy === "whitelist") {
    const allow = parseModelList(keyRow?.allowedModels);
    if (allow.length === 0) return true; // empty whitelist = allow all (fail-open)
    return allow.some((e) => modelMatches(e, model));
  }
  const deny = parseModelList(keyRow?.blockedModels);
  if (deny.length === 0) return true;
  return !deny.some((e) => modelMatches(e, model));
}
