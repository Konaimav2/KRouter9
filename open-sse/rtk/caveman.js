// Caveman injector: appends a caveman-style instruction into the system message
// of the final request body, just before it is dispatched to the provider executor.

import { injectSystemPrompt } from "./systemInject.js";
import { CAVEMAN_PROMPTS, CAVEMAN_LEVELS } from "./cavemanPrompts.js";

const WENYAN_LEVELS = new Set([
  CAVEMAN_LEVELS.WENYAN_LITE,
  CAVEMAN_LEVELS.WENYAN,
  CAVEMAN_LEVELS.WENYAN_ULTRA,
]);

// Resolve the effective level. Wenyan (classical Chinese) levels force the
// model to reply in 文言文 regardless of the user's language, so they require
// explicit opt-in; otherwise fall back to "ultra" (terse, language-preserving).
// Unknown levels pass through to the prompt lookup (undefined → no injection).
export function resolveCavemanLevel(level, { wenyanOptIn = false } = {}) {
  if (WENYAN_LEVELS.has(level) && !wenyanOptIn) return "ultra";
  return level;
}

export function injectCaveman(body, format, level, opts) {
  injectSystemPrompt(body, format, CAVEMAN_PROMPTS[resolveCavemanLevel(level, opts)]);
}
