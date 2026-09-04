// Prompt-injection detector — KRouter9 minimal port (OmniRoute concept, self-contained).
// Fail-open: any error returns { block: false, detections: [] }.
import { BaseGuardrail } from "./base.js";

export const DEFAULT_GUARD_PATTERNS = [
  { name: "system_override_inline", pattern: /\bsystem\s*:\s*override\b/i, severity: "high" },
  { name: "markdown_system_block", pattern: /```+\s*system\b/i, severity: "high" },
  { name: "ignore_instructions", pattern: /\bignore\s+(all\s+)?(previous|prior|above)\s+instructions?\b/i, severity: "high" },
  { name: "disregard_rules", pattern: /\bdisregard\s+(all\s+)?(rules|safety|guardrails?|policies)\b/i, severity: "high" },
  { name: "jailbreak_dan", pattern: /\b(DAN|do\s+anything\s+now|jailbreak)\b/i, severity: "high" },
  { name: "prompt_leak", pattern: /\b(reveal|show|print|output)\s+(your\s+)?(system\s+)?(prompt|instructions?)\b/i, severity: "medium" },
  { name: "role_hijack", pattern: /\byou\s+are\s+now\s+(a\s+)?(?!helpful|an?\s+ai\b)[a-z ]{3,30}\b/i, severity: "medium" },
  { name: "base64_smuggle", pattern: /\b[A-Za-z0-9+/]{100,}={0,2}\b/, severity: "low" },
];

const SEVERITY_SCORES = { low: 1, medium: 3, high: 5 };

export function normalizePatternEntry(entry, index = 0) {
  if (entry instanceof RegExp) return { name: `custom_${index}`, pattern: entry, severity: "high" };
  if (typeof entry === "string") {
    try { return { name: `custom_${index}`, pattern: new RegExp(entry, "i"), severity: "high" }; }
    catch { return null; }
  }
  if (entry && entry.pattern) return entry;
  return null;
}

export function detectWithPatterns(text, patterns = DEFAULT_GUARD_PATTERNS) {
  const detections = [];
  if (typeof text !== "string" || !text) return detections;
  const head = text.slice(0, 8000);
  patterns.forEach((entry, i) => {
    const p = normalizePatternEntry(entry, i);
    if (!p) return;
    try {
      p.pattern.lastIndex = 0;
      const m = head.match(p.pattern);
      if (m) detections.push({ pattern: p.name, match: String(m[0]).slice(0, 120), severity: p.severity || "medium" });
    } catch (_e) {}
  });
  return detections;
}

export function shouldBlock(detections, threshold = 5) {
  const score = detections.reduce((s, d) => s + (SEVERITY_SCORES[d.severity] || 1), 0);
  return score >= threshold;
}

export function evaluatePromptInjection(body, options = {}) {
  try {
    const texts = [];
    const msgs = body?.messages || body?.request?.contents || [];
    for (const m of (Array.isArray(msgs) ? msgs : [])) {
      if (typeof m.content === "string") texts.push(m.content);
      else if (Array.isArray(m.content)) for (const p of m.content) if (typeof p.text === "string") texts.push(p.text);
      else if (typeof m.text === "string") texts.push(m.text);
    }
    const patterns = [...DEFAULT_GUARD_PATTERNS, ...(options.customPatterns || [])];
    const detections = detectWithPatterns(texts.join("\n"), patterns);
    return { block: options.block === true && shouldBlock(detections, options.threshold ?? 5), detections };
  } catch { return { block: false, detections: [] }; }
}

export class PromptInjectionGuardrail extends BaseGuardrail {
  constructor(options = {}) { super("prompt-injection", options); this.opts = options; }
  async preCall(payload) {
    const r = evaluatePromptInjection(payload, this.opts);
    return { block: r.block, message: r.block ? "Prompt-injection detected" : undefined, meta: { detections: r.detections } };
  }
}
