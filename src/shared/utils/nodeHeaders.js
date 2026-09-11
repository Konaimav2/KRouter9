// "curl-like" per-node request headers: parse/serialize the textarea format.
// Kept JSX-free so it is unit-testable without a DOM.
//
// V9 hardening:
//  - lowercase header names (avoid `Authorization`/`authorization` merging into
//    one comma-joined credential when applied via the Headers API);
//  - validate names with HTTP token syntax and reject CR/LF in values;
//  - drop auth/cookie/host/content-length by default (custom headers are applied
//    last and would silently override generated auth);
//  - cap header count and value length to bound memory/abuse.

const MAX_HEADERS = 50;
const MAX_NAME_LEN = 128;
const MAX_VALUE_LEN = 8192;

// HTTP token chars per RFC 7230.
const TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;
// Reserved headers a per-node override must not clobber.
const RESERVED = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "host",
  "content-length",
  "content-type",
  "x-api-key",
  "api-key",
  "x-goog-api-key",
]);

export function headersToText(headers) {
  if (!headers || typeof headers !== "object") return "";
  return Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\n");
}

/**
 * @param {string} text
 * @param {{ allowReserved?: boolean }} [opts]
 * @returns {Record<string,string>}
 */
export function textToHeaders(text, opts = {}) {
  const out = {};
  const allowReserved = opts?.allowReserved === true;
  for (const line of String(text || "").split("\n")) {
    if (Object.keys(out).length >= MAX_HEADERS) break;
    // Reject any raw carriage return rather than relying on trim() to hide it.
    if (line.includes("\r")) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const rawValue = line.slice(idx + 1).trim();
    if (!name || !rawValue) continue;
    if (name.length > MAX_NAME_LEN) continue;
    if (!TOKEN_RE.test(name)) continue;
    if (/[\r\n]/.test(rawValue)) continue;
    if (!allowReserved && RESERVED.has(name)) continue;
    out[name] = rawValue.slice(0, MAX_VALUE_LEN);
  }
  return out;
}
