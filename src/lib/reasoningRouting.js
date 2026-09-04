// Reasoning routing rules — KRouter9 minimal (OmniRoute concept).
// Maps tag patterns in the prompt to a target model + effort level.
// Rules stored in settings.reasoningRoutingRules: [{ match, model, effort, enabled }]
// Fail-open: no match or any error → null (caller keeps original model).
export function resolveReasoningRoute(messages, rules = []) {
  try {
    if (!Array.isArray(rules) || !rules.length) return null;
    const text = (Array.isArray(messages) ? messages : [messages])
      .map(m => typeof m === "string" ? m : (typeof m?.content === "string" ? m.content : ""))
      .join("\n").toLowerCase();
    for (const r of rules) {
      if (r.enabled === false) continue;
      if (!r.match || !r.model) continue;
      if (text.includes(String(r.match).toLowerCase())) {
        return { model: r.model, effort: r.effort || null, rule: r.match };
      }
    }
    return null;
  } catch { return null; }
}
