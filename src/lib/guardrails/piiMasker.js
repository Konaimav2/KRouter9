// PII masker — KRouter9 minimal port (OmniRoute concept, self-contained).
// Fail-open: any error returns input unchanged.
import { redactCredentials } from "./credentialMasker.js";

const PII_PATTERNS = [
  { name: "email", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[REDACTED:email]" },
  { name: "phone", regex: /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4}\b/g, replacement: "[REDACTED:phone]" },
  { name: "ipv4", regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: "[REDACTED:ip]" },
  { name: "creditcard", regex: /\b(?:\d[ -]?){13,19}\b/g, replacement: "[REDACTED:card]" },
];

export function maskPII(text) {
  try {
    if (typeof text !== "string" || !text) return { text, detections: [] };
    let out = redactCredentials(text);
    out = typeof out === "string" ? out : (out?.text ?? text);
    const detections = [];
    for (const p of PII_PATTERNS) {
      p.regex.lastIndex = 0;
      const m = out.match(p.regex);
      if (m?.length) { out = out.replace(p.regex, p.replacement); detections.push({ type: p.name, count: m.length }); }
    }
    return { text: out, detections };
  } catch { return { text, detections: [] }; }
}

export function sanitizePII(text) { return maskPII(text).text; }
export function sanitizePIIResponse(text) { return maskPII(text).text; }
