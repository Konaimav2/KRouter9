// Runtime sanitizer for per-connection custom headers. Persistence already
// sanitizes node headers, but connections can be written through other routes
// and legacy rows predate the check. Apply the same rules at the point of use:
// lowercase token names, no CR/LF, reserved auth/host headers dropped, caps.

const MAX_HEADERS = 50;
const MAX_NAME_LEN = 128;
const MAX_VALUE_LEN = 8192;
const TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;
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

/**
 * Apply sanitized custom headers to a target header object, in place.
 * Auth/generated headers are set elsewhere; reserved names are refused so a
 * connection cannot silently override them via the custom-header field.
 */
export function applyCustomHeaders(target, customHeaders) {
  if (!customHeaders || typeof customHeaders !== "object" || Array.isArray(customHeaders)) return target;
  let applied = 0;
  for (const [k, v] of Object.entries(customHeaders)) {
    if (applied >= MAX_HEADERS) break;
    const name = String(k).trim().toLowerCase();
    const val = v == null ? "" : String(v);
    if (!name || name.length > MAX_NAME_LEN) continue;
    if (!TOKEN_RE.test(name)) continue;
    if (/[\r\n]/.test(val)) continue;
    if (RESERVED.has(name)) continue;
    target[name] = val.slice(0, MAX_VALUE_LEN);
    applied++;
  }
  return target;
}
