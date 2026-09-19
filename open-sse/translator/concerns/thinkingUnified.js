// Unified thinking normalization: extract client intent → apply provider-native format.
// Config-driven: thinking format/limits come from capabilities.js + registry transport,
// never hardcoded per-model here. See .docs/thinking/plan.md MATRIX VI-A.

import { getCapabilitiesForModel } from "../../providers/capabilities.js";
import { getThinkingLevels } from "../../providers/thinkingLevels.js";
import { PROVIDERS } from "../../providers/index.js";
import { LEVEL_TO_BUDGET, budgetToLevel, effortToBudget, effortToThinkingLevel } from "./thinking.js";

// Map a target wire-format to its native thinking format (when capability has none).
const FORMAT_TO_NATIVE = {
  openai: "openai",
  "openai-responses": "openai",
  "openai-response": "openai",
  codex: "openai",
  claude: "claude-budget",
  gemini: "gemini-budget",
  "gemini-cli": "gemini-budget",
  vertex: "gemini-budget",
  antigravity: "gemini-budget",
  kiro: "kiro",
};

// Strip a trailing thinking suffix "model(value)" → "model" (no-op when absent).
export function stripThinkingSuffix(model) {
  if (typeof model !== "string") return model;
  const m = model.match(/^(.*)\([^()]+\)\s*$/);
  return m ? m[1].trim() : model;
}

// Parse model-name suffix "model(value)" → { cleanModel, override }.
// value: level name (high) | number (8192) | auto | none. null override when absent.
export function parseSuffix(model) {
  if (typeof model !== "string") return { cleanModel: model, override: null };
  const m = model.match(/^(.*)\(([^()]+)\)\s*$/);
  if (!m) return { cleanModel: model, override: null };
  const cleanModel = m[1].trim();
  const raw = m[2].trim().toLowerCase();
  if (raw === "none" || raw === "off") return { cleanModel, override: { mode: "none" } };
  if (raw === "auto") return { cleanModel, override: { mode: "auto" } };
  if (raw === "ultra") return { cleanModel, override: { mode: "level", level: raw } };
  if (/^\d+$/.test(raw)) return { cleanModel, override: { mode: "budget", budget: Number(raw) } };
  if (LEVEL_TO_BUDGET[raw] !== undefined) return { cleanModel, override: { mode: "level", level: raw } };
  return { cleanModel, override: null };
}

// Extract unified thinking intent from a request body (post-translation, mixed shapes).
// Returns { mode, budget?, level? } or null when no thinking intent present.
export function extractThinking(body) {
  if (!body || typeof body !== "object") return null;

  // Claude output_config.effort (explicit) — priority over adaptive thinking
  const oc = body.output_config?.effort;
  if (typeof oc === "string" && oc) {
    const e = oc.toLowerCase();
    if (e === "none" || e === "off") return { mode: "none" };
    if (e === "auto") return { mode: "auto" };
    return { mode: "level", level: e };
  }

  // OpenAI chat / Responses shape — check effort first (zai sends both thinking object and reasoning.effort)
  const effort = body.reasoning_effort ?? (typeof body.reasoning === "object" ? body.reasoning?.effort : null);
  if (typeof effort === "string" && effort) {
    const e = effort.toLowerCase();
    if (e === "none" || e === "off") return { mode: "none" };
    if (e === "auto") return { mode: "auto" };
    return { mode: "level", level: e };
  }

  // Claude shape
  const t = body.thinking;
  if (t && typeof t === "object") {
    if (t.type === "disabled") return { mode: "none" };
    if (t.type === "adaptive" || t.type === "enabled") {
      const budget = Number(t.budget_tokens);
      if (Number.isFinite(budget) && budget > 0) return { mode: "budget", budget };
      return { mode: "auto" };
    }
  }

  // Gemini shape (top-level, generationConfig, or request envelope)
  const tc = body.thinkingConfig || body.generationConfig?.thinkingConfig || body.request?.generationConfig?.thinkingConfig;
  if (tc && typeof tc === "object") {
    if (typeof tc.thinkingLevel === "string") return { mode: "level", level: tc.thinkingLevel.toLowerCase() };
    const tb = Number(tc.thinkingBudget);
    if (Number.isFinite(tb)) {
      if (tb === 0) return { mode: "none" };
      if (tb < 0) return { mode: "auto" };
      return { mode: "budget", budget: tb };
    }
  }

  // Qwen shape
  if (body.enable_thinking === false) return { mode: "none" };
  if (body.enable_thinking === true) {
    const tb = Number(body.thinking_budget);
    if (Number.isFinite(tb) && tb > 0) return { mode: "budget", budget: tb };
    return { mode: "auto" };
  }

  return null;
}

// Capture thinking intent from a body. Alias of extractThinking, named for clarity
// at the call-site where intent is snapshotted before format translation.
export const captureThinking = extractThinking;

const NATIVE_ONLY_FORMATS = new Set(["gemini-level", "gemini-budget", "claude-budget", "claude-adaptive", "kiro"]);

function resolveFormat(targetFormat, model, provider) {
  const providerFmt = provider ? PROVIDERS[provider]?.thinkingFormat : null;
  if (providerFmt) return providerFmt;
  const caps = getCapabilitiesForModel(provider, model);
  const isOpenAIWire = targetFormat === "openai" || targetFormat === "openai-responses";
  if (caps.thinkingFormat && !(isOpenAIWire && NATIVE_ONLY_FORMATS.has(caps.thinkingFormat))) {
    return caps.thinkingFormat;
  }
  return FORMAT_TO_NATIVE[targetFormat] || "openai";
}

// Nearest-match clamp ladder, index-ordered low→high. `none`/`off`/`minimal`
// are distinct floor rungs (never aliased). `default` is a send-nothing
// sentinel handled by callers; `auto` passes the client value through.
const CLAMP_LADDER = ["off", "none", "minimal", "low", "medium", "high", "xhigh", "max"];
const CLAMP_ALIASES = { ultra: "max" };

export function isKnownThinkingLevel(value) {
  if (typeof value !== "string") return false;
  const e = value.toLowerCase().trim();
  return CLAMP_LADDER.includes(e) || e === "ultra";
}

function normalizeClampAlias(value) {
  const e = String(value).toLowerCase().trim();
  return CLAMP_ALIASES[e] || e;
}

export function assertKnownThinkingLevel(value) {
  if (!isKnownThinkingLevel(value)) {
    throw new Error(`invalid reasoning level: ${value}`);
  }
  return normalizeClampAlias(value);
}

// Nearest-match clamp of a requested level against a model's supported set.
// Exact hit → as-is. Above max → model's max. Below min → model's min.
// Mid-gap → nearest supported at or below (never invent upward).
// `none`/`off` are excluded from candidates (they are disable signals).
// Throws `invalid reasoning level` for unknown strings.
export function clampThinkingLevel(requested, supportedLevels) {
  if (typeof requested !== "string" || !isKnownThinkingLevel(requested)) {
    throw new Error(`invalid reasoning level: ${requested}`);
  }
  const norm = (Array.isArray(supportedLevels) ? supportedLevels : []).map((s) => String(s).toLowerCase());
  const raw = String(requested).toLowerCase().trim();
  // Exact hit first — a model that natively supports "ultra" keeps it.
  if (norm.includes(raw)) return raw;
  const level = normalizeClampAlias(requested);
  // none/off are equivalent disable signals: accept either spelling.
  if ((level === "none" || level === "off") && norm.some((s) => s === "none" || s === "off")) {
    return norm.includes("none") ? "none" : "off";
  }
  const candidates = norm
    .map((s) => CLAMP_LADDER.indexOf(s))
    .filter((i) => i >= 0 && CLAMP_LADDER[i] !== "none" && CLAMP_LADDER[i] !== "off");
  if (!candidates.length) return level;
  const idx = CLAMP_LADDER.indexOf(level);
  const maxSup = Math.max(...candidates);
  const minSup = Math.min(...candidates);
  if (idx > maxSup) return CLAMP_LADDER[maxSup];
  if (idx < minSup) return CLAMP_LADDER[minSup];
  let best = minSup;
  for (const i of candidates) if (i <= idx && i > best) best = i;
  return CLAMP_LADDER[best];
}

// Validate user-supplied thinking BEFORE translation. Returns an error message
// or null. Checks the model suffix and every explicit level field; unknown
// strings fail closed with `invalid reasoning level`. Budgets (numbers),
// `auto`, `default`, `none`, `off` are always accepted here.
export function validateThinkingRequest(body, model) {
  const check = (value, where) => {
    if (value === undefined || value === null) return null;
    // Level fields are strings; arrays/objects/numbers here are malformed and
    // must fail closed (they would otherwise survive into outbound requests).
    if (typeof value !== "string") {
      return `invalid reasoning level: non-string ${where}`;
    }
    const e = value.toLowerCase().trim();
    if (!e || e === "auto" || e === "default") return null;
    if (!isKnownThinkingLevel(value)) {
      return `invalid reasoning level: ${value} (${where})`;
    }
    return null;
  };

  if (typeof model === "string") {
    const m = model.match(/^(.*)\(([^()]+)\)\s*$/);
    if (m) {
      const raw = m[2].trim().toLowerCase();
      if (!/^\d+$/.test(raw) && raw !== "auto" && raw !== "none" && raw !== "off" && !isKnownThinkingLevel(raw)) {
        return `invalid reasoning level: ${m[2].trim()} (model suffix)`;
      }
    }
  }
  if (!body || typeof body !== "object") return null;

  return (
    check(body.reasoning_effort, "reasoning_effort") ||
    check(typeof body.reasoning === "object" ? body.reasoning?.effort : null, "reasoning.effort") ||
    check(body.output_config?.effort, "output_config.effort") ||
    check(body.thinkingConfig?.thinkingLevel, "thinkingConfig.thinkingLevel") ||
    check(body.generationConfig?.thinkingConfig?.thinkingLevel, "thinkingLevel") ||
    check(body.request?.generationConfig?.thinkingConfig?.thinkingLevel, "thinkingLevel") ||
    null
  );
}

// Convert unified config to a budget number (for budget-based formats).
function toBudget(cfg, range) {
  let budget;
  if (cfg.mode === "budget") budget = cfg.budget;
  else if (cfg.mode === "level") budget = effortToBudget(cfg.level);
  else if (cfg.mode === "auto") return -1;
  if (!Number.isFinite(budget)) return undefined;
  if (range) {
    if (range.min != null && budget < range.min) budget = range.min;
    if (range.max != null && budget > range.max) budget = range.max;
  }
  return budget;
}

// Convert unified config to a discrete level string.
function toLevel(cfg) {
  if (cfg.mode === "level") return cfg.level;
  if (cfg.mode === "budget") return budgetToLevel(cfg.budget) || "medium";
  if (cfg.mode === "auto") return "auto";
  return null;
}

function normalizeOpenAILevel(level, supportedLevels) {
  // Nearest-match clamp (ultra→max alias inside). Throws invalid reasoning level.
  return clampThinkingLevel(level, supportedLevels);
}

function toGeminiThinkingLevel(cfg) {
  const raw = cfg.mode === "auto" ? null : (toLevel(cfg) || null);
  if (!raw || raw === "auto") return null;
  return effortToThinkingLevel(raw);
}

function toKimiReasoningEffort(cfg) {
  const level = toLevel(cfg);
  if (!level || level === "auto") return null;
  if (level === "minimal") return "low";
  if (level === "xhigh") return "max";
  if (["low", "medium", "high", "max"].includes(level)) return level;
  return null;
}

const GEMINI_LEVEL_OUTPUT_FLOOR = {
  minimal: 4096,
  low: 8192,
  medium: 16384,
  high: 65535,
};

function geminiBudgetOutputFloor(budget) {
  if (budget === -1) return 32768;
  if (!Number.isFinite(budget)) return 32768;
  if (budget <= 1024) return 8192;
  if (budget <= 8192) return 16384;
  if (budget <= 24576) return 32768;
  return 65535;
}

function geminiLevelOutputFloor(level) {
  return GEMINI_LEVEL_OUTPUT_FLOOR[level] || GEMINI_LEVEL_OUTPUT_FLOOR.high;
}

// Gemini nests thinkingConfig under generationConfig. gemini-cli / antigravity wrap
// the whole request in a { request: { generationConfig } } envelope — target the
// envelope's generationConfig when present, else the top-level one.
function getGeminiGenerationConfig(body) {
  if (body.request && typeof body.request === "object") {
    if (!body.request.generationConfig || typeof body.request.generationConfig !== "object") {
      body.request.generationConfig = {};
    }
    return body.request.generationConfig;
  }
  if (!body.generationConfig || typeof body.generationConfig !== "object") {
    body.generationConfig = {};
  }
  return body.generationConfig;
}

function setGeminiThinking(body, tc) {
  const gc = getGeminiGenerationConfig(body);
  gc.thinkingConfig = tc;
}

function ensureGeminiOutputFloor(body, floor, caps) {
  const cap = Number.isFinite(caps?.maxOutput) ? caps.maxOutput : floor;
  const target = Math.min(floor, cap);
  const gc = getGeminiGenerationConfig(body);
  const current = Number(gc.maxOutputTokens);
  if (!Number.isFinite(current) || current < target) {
    gc.maxOutputTokens = target;
  }
}

// Strip every known thinking field from a body (used before re-applying / when unsupported).
function stripAll(body) {
  delete body.thinking;
  delete body.reasoning_effort;
  delete body.reasoning;
  delete body.thinkingConfig;
  delete body.enable_thinking;
  delete body.thinking_budget;
  delete body.output_config;
  if (body.generationConfig) delete body.generationConfig.thinkingConfig;
  if (body.request?.generationConfig) delete body.request.generationConfig.thinkingConfig;
}

// Apply unified thinking config to body in the resolved provider-native format.
function applyFormat(fmt, body, cfg, caps, supportedLevels, display) {
  const none = cfg.mode === "none";
  const canDisable = caps.thinkingCanDisable !== false;
  // Model cannot disable thinking → clamp "none" to minimal effort instead.
  const eff = none && !canDisable ? { mode: "level", level: "minimal" } : cfg;

  switch (fmt) {
    case "openai": {
      if (none && canDisable) { body.reasoning_effort = "none"; break; }
      const level = toLevel(eff);
      // auto with no concrete value → send nothing (provider decides).
      if (!level || level === "auto") break;
      body.reasoning_effort = normalizeOpenAILevel(level, supportedLevels);
      break;
    }
    case "claude-adaptive": {
      if (none && canDisable) { body.thinking = { type: "disabled" }; break; }
      // Models that can disable thinking need the explicit adaptive switch.
      // Permanently adaptive models such as Fable 5.1 accept effort directly.
      if (canDisable) body.thinking = { type: "adaptive", ...(display ? { display } : {}) };
      else delete body.thinking;
      const level = toLevel(eff);
      // auto with no concrete value → keep the native adaptive shape, invent no effort.
      if (!level || level === "auto") break;
      body.output_config = { effort: clampThinkingLevel(level, supportedLevels) };
      break;
    }
    case "claude-budget": {
      if (none && canDisable) { body.thinking = { type: "disabled" }; break; }
      const budget = toBudget(eff, caps.thinkingRange);
      body.thinking = budget === -1 ? { type: "enabled", ...(display ? { display } : {}) } : { type: "enabled", budget_tokens: budget || 8192, ...(display ? { display } : {}) };
      break;
    }
    case "gemini-level": {
      if (eff.mode === "auto") break; // pass through: omit level, provider decides
      const level = none ? "minimal" : toGeminiThinkingLevel(eff);
      if (!level) break;
      setGeminiThinking(body, { thinkingLevel: level, includeThoughts: level !== "minimal" });
      ensureGeminiOutputFloor(body, geminiLevelOutputFloor(level), caps);
      break;
    }
    case "gemini-budget": {
      if (none && canDisable) { setGeminiThinking(body, { thinkingBudget: 0, includeThoughts: false }); break; }
      const budget = toBudget(eff, caps.thinkingRange);
      setGeminiThinking(body, { thinkingBudget: budget ?? -1, includeThoughts: true });
      ensureGeminiOutputFloor(body, geminiBudgetOutputFloor(budget ?? -1), caps);
      break;
    }
    case "zai": {
      // Z.ai ignores thinking.disabled → must use enable_thinking:false to turn off.
      if (none && canDisable) { body.enable_thinking = false; delete body.thinking; break; }
      body.thinking = { type: "enabled" };
      // reasoning_effort is only read by z.ai from GLM-5.2 onward — older GLM ignores it
      // (see thinkingEffortSupported in capabilities.js). Skip on unsupported models so we
      // don't send a field the API doesn't recognize.
      if (caps.thinkingEffortSupported) {
        const zaiLvl = toLevel(eff);
        // auto → keep `thinking` enabled but invent no effort value.
        if (!zaiLvl || zaiLvl === "auto") break;
        // GLM-5.3 only accepts exactly low|high|max (anything else errors); GLM-5.2 accepts
        // a wider set but z.ai maps low/medium->high and xhigh->max server-side anyway, so
        // this 3-value mapping matches both.
        body.reasoning_effort = (zaiLvl === "low" || zaiLvl === "minimal") ? "low"
          : (zaiLvl === "high" || zaiLvl === "medium") ? "high"
          : "max";
      }
      break;
    }
    case "qwen": {
      if (none && canDisable) { body.enable_thinking = false; break; }
      body.enable_thinking = true;
      const budget = toBudget(eff, caps.thinkingRange);
      if (Number.isFinite(budget) && budget > 0) body.thinking_budget = budget;
      break;
    }
    case "deepseek": {
      if (none && canDisable) { body.thinking = { type: "disabled" }; break; }
      body.thinking = { type: "enabled" };
      // Nearest-match clamp against the model's real set (hiMax: none/high/max).
      // auto with no concrete value → enabled shape, no invented effort.
      const level = toLevel(eff);
      if (!level || level === "auto") break;
      body.reasoning_effort = clampThinkingLevel(level, supportedLevels);
      break;
    }
    case "kimi": {
      if (none && canDisable) { body.thinking = { type: "disabled" }; break; }
      const effort = toKimiReasoningEffort(eff);
      if (effort) body.reasoning_effort = effort;
      break;
    }
    case "minimax": {
      // M3 adaptive; M2.x cannot disable (handled via canDisable clamp).
      body.thinking = { type: none && canDisable ? "disabled" : "adaptive" };
      break;
    }
    case "hunyuan": {
      if (none && canDisable) { body.thinking = { type: "disabled" }; break; }
      const budget = toBudget(eff, caps.thinkingRange);
      body.thinking = budget === -1 ? { type: "enabled" } : { type: "enabled", budget_tokens: budget || 8192 };
      break;
    }
    case "step": {
      if (none && canDisable) break;
      const level = toLevel(eff);
      if (!level || level === "auto") break;
      body.reasoning_effort = clampThinkingLevel(level, supportedLevels);
      break;
    }
    case "tokenrouter": {
      // TokenRouter's reasoning_effort enum is low/medium/high/xhigh/max — it rejects
      // "none"/"auto" with a 400 and supports "max" natively (no clamp like openai).
      // "none" → omit the field so the upstream default applies; pass levels through.
      if (none || eff.mode === "auto") break;
      const level = toLevel(eff);
      if (level) body.reasoning_effort = assertKnownThinkingLevel(level);
      break;
    }
    case "kiro":
      // Kiro thinking handled via system-tag injection in openai-to-kiro.js; no body field here.
      break;
    default:
      break;
  }
}

// Public entry: normalize thinking for the resolved target format.
// Mutates and returns body. No-op when model has no reasoning capability.
// `intent` is a pre-captured config (from captureThinking on the original body);
// falls back to extracting from the current body when omitted.
export function applyThinking(targetFormat, model, body, provider = null, intent = undefined) {
  if (!body || typeof body !== "object") return body;

  const { cleanModel, override } = parseSuffix(model);
  const cfg = override || intent || extractThinking(body);
  const caps = getCapabilitiesForModel(provider, cleanModel);

  // Model cannot reason → strip any stray thinking fields.
  if (!caps.reasoning) {
    stripAll(body);
    return body;
  }
  if (!cfg) return body;

  const fmt = resolveFormat(targetFormat, cleanModel, provider);
  const supportedLevels = getThinkingLevels(provider, cleanModel);
  // Anthropic's `display` (summarized | omitted) decides whether thinking text
  // comes back at all; keep what the client asked for instead of resetting it.
  const display = typeof body.thinking?.display === "string" ? body.thinking.display : undefined;
  stripAll(body);
  applyFormat(fmt, body, cfg, caps, supportedLevels, display);
  return body;
}
