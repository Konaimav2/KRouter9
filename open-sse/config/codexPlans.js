/**
 * Codex (ChatGPT OAuth) plan → model eligibility.
 *
 * A ChatGPT subscription exposes different model families per plan. Free plans
 * reach the luna/terra families only; sol/astra/spark need a paid plan. The
 * upstream answers a free account with
 *   `400 {"detail":"The 'gpt-6.1-sol' model is not supported when using Codex ..."}`
 * which costs a full round trip and (before this gate) locked the account for a
 * model it was never entitled to.
 *
 * Kept as patterns, not exact ids, so dated variants (`-review`, `[1m]`, future
 * point releases) match without a config edit per model.
 *
 * Unknown/absent plan metadata is treated as allowed: connections imported
 * before plan capture must not silently lose routing.
 */
export const CODEX_FREE_PLAN_MODEL_PATTERNS = [/luna/i, /terra/i];

/**
 * @param {string|null|undefined} model - requested model id (e.g. "gpt-6.1-sol[1m]")
 * @param {string|null|undefined} planType - providerSpecificData.chatgptPlanType
 * @returns {boolean} true when the account may be tried for this model
 */
export function isCodexModelAllowedForPlan(model, planType) {
  if (!model) return true;
  const plan = String(planType || "").trim().toLowerCase();
  if (!plan) return true;
  if (plan !== "free") return true;
  return CODEX_FREE_PLAN_MODEL_PATTERNS.some((pattern) => pattern.test(String(model)));
}

/**
 * Models that need a paid ChatGPT plan. Used only for dashboard messaging —
 * routing relies on {@link isCodexModelAllowedForPlan}.
 */
export function isCodexPaidPlanModel(model) {
  if (!model) return false;
  return !CODEX_FREE_PLAN_MODEL_PATTERNS.some((pattern) => pattern.test(String(model)));
}
