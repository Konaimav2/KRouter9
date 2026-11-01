/**
 * OpenCode free-lane model status.
 *
 * Status is derived from what the API answers, not from the /models catalog: the catalog
 * lags reality. On 2026-10-25 `nemotron-3-ultra-free` was missing from /models while the
 * API still served it (free-limit gate, not deprecated), and `mimo-v2.5-free` was still
 * listed on some surfaces while the API answered 410 ModelDeprecated.
 *
 * Verified response taxonomy (2026-10-25, free lane `Bearer public`):
 *   200                          -> live
 *   429 FreeUsageLimitError      -> live; the shared free tier is rate limited
 *   410 ModelDeprecated          -> retired; metadata.replacement names the successor
 *   400 "Model is unavailable."  -> retired / unavailable
 *   402 / 403 / payment message  -> no longer free (paid plan required)
 *   404                          -> unknown to upstream
 */

export const OPENCODE_FREE_STATE = {
  LIVE: "live",
  RETIRED: "retired",
  NOT_FREE: "not-free",
  UNKNOWN: "unknown",
};

// Confirmed retirements, kept so stored references fail fast with a migration path instead
// of paying a round-trip that can only answer 400/410. A retirement is evidence, not a
// permanent fact: the free catalog rotates, so entries expire and upstream gets the next
// word. Muse Spark is intentionally absent — its deprecation is old and must be retryable.
export const RETIREMENT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const RETIRED_OPENCODE_FREE_MODELS = new Map([
  ["deepseek-v4-flash-free", { replacement: null, reason: "Model is unavailable", checkedAt: "2026-10-25" }],
  ["ling-3.0-flash-fin-free", { replacement: null, reason: "Model is unavailable", checkedAt: "2026-10-25" }],
  ["mimo-v2.5-free", { replacement: "mimo-v2.6-flash-free", reason: "ModelDeprecated (410)", checkedAt: "2026-10-25" }],
]);

// Free-lane provider ids only. Keyed Zen keeps its own upstream contract and is not
// guarded here: a paid plan may still reach models the free lane retired.
const FREE_LANE_PROVIDERS = new Set(["opencode", "oc"]);

const PAYMENT_HINT = /not included|upgrade|purchase|payment|credits? required|paid plan|subscription required/i;

function stripSuffix(model) {
  return typeof model === "string" ? model.replace(/\([^()]+\)\s*$/, "").trim() : "";
}

export function baseOpencodeModelId(model) {
  const clean = stripSuffix(model);
  if (!clean) return "";
  return clean.includes("/") ? clean.split("/").pop() : clean;
}

function parseBody(body) {
  if (body && typeof body === "object") return body;
  if (typeof body !== "string") return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * Classify one probe result. `status` is the HTTP status, `body` the raw response text
 * (or an already-parsed object).
 */
export function classifyOpencodeProbe(status, body) {
  const payload = parseBody(body);
  // Upstream wraps errors as { type: "error", error: { type: "ModelDeprecated" } }, so the
  // specific type is nested; keep both and match against the combined text.
  const errorType = [payload?.type, payload?.error?.type].filter(Boolean).join(" ");
  const message = payload?.error?.message || payload?.message || (typeof body === "string" ? body : "");
  const replacement = payload?.metadata?.replacement || null;
  const numericStatus = Number(status);

  if (numericStatus === 200) {
    return { state: OPENCODE_FREE_STATE.LIVE, replacement: null, detail: "Served." };
  }

  // The free gate fires after model validation, so a 429 proves the model exists.
  if (numericStatus === 429 && /FreeUsageLimitError/i.test(`${errorType} ${message}`)) {
    return {
      state: OPENCODE_FREE_STATE.LIVE,
      replacement: null,
      detail: "Free tier rate limited; the model itself is served.",
    };
  }

  if (numericStatus === 410 && /ModelDeprecated/i.test(`${errorType} ${message}`)) {
    return {
      state: OPENCODE_FREE_STATE.RETIRED,
      replacement,
      detail: message || "Model deprecated upstream.",
    };
  }

  if (numericStatus === 400 && /Model is unavailable/i.test(message)) {
    return { state: OPENCODE_FREE_STATE.RETIRED, replacement: null, detail: message };
  }

  if (numericStatus === 402 || numericStatus === 403) {
    return {
      state: OPENCODE_FREE_STATE.NOT_FREE,
      replacement: null,
      detail: message || `Upstream answered ${numericStatus}.`,
    };
  }

  // Paid-plan wording only counts when it is not the free-tier upsell (which is a 429
  // FreeUsageLimitError and means the model is still free).
  if (numericStatus >= 400 && PAYMENT_HINT.test(message) && !/FreeUsageLimitError/i.test(errorType)) {
    return { state: OPENCODE_FREE_STATE.NOT_FREE, replacement: null, detail: message };
  }

  if (numericStatus === 404) {
    return { state: OPENCODE_FREE_STATE.UNKNOWN, replacement: null, detail: message || "Unknown to upstream." };
  }

  return {
    state: OPENCODE_FREE_STATE.UNKNOWN,
    replacement: null,
    detail: message || `Upstream answered ${numericStatus}.`,
  };
}

/**
 * Fast-fail lookup for the routing path. Returns null when the model is not a known
 * retirement on the free lane.
 */
export function getOpencodeRetirement(providerId, model) {
  if (!FREE_LANE_PROVIDERS.has(String(providerId || "").trim().toLowerCase())) return null;
  const id = baseOpencodeModelId(model);
  if (!id) return null;
  const entry = RETIRED_OPENCODE_FREE_MODELS.get(id);
  if (!entry) return null;
  // Evidence ages out: after the window the model is retried upstream rather than blocked
  // forever, because the free catalog rotates.
  if (entry.checkedAt && Date.now() - Date.parse(entry.checkedAt) >= RETIREMENT_TTL_MS) return null;
  return {
    model: id,
    replacement: entry.replacement,
    reason: entry.reason,
    message: entry.replacement
      ? `Model ${id} is retired upstream. Use ${entry.replacement} instead.`
      : `Model ${id} is retired upstream (${entry.reason}).`,
  };
}
