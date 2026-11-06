// Shared upstream-network classification + URL credential masking.
//
// "Did the upstream socket die (vs. a client/deadline abort, or a pure
// connect/read timeout)?" is answered in exactly one place:
// getUpstreamResetCode(). Consumers:
//   - executors/base.js — no same-URL retry when the reset is classified;
//   - utils/streamHandler.js — graceful close vs hard error on mid-stream bails;
//   - handlers/chatCore.js — pre-header reset durable ledger record.
//
// Previously this knowledge was duplicated: string checks inline in
// streamHandler.js, and a blanket thrown-exception → 502 retry mapping in
// base.js that re-POSTed a dead socket up to 3×.
//
// Reset codes are intentionally narrow: ECONNRESET / EPIPE / UND_ERR_SOCKET
// (undici's wrapper for socket errors) plus the legacy node-http
// "socket hang up" message. ETIMEDOUT and connect timeouts are NOT resets —
// they have their own timeout/retry policy. AbortError / TimeoutError and
// abort-worded messages (client cancel, deadline abort) are never resets.

const RESET_CODES = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET"]);

const RESET_MESSAGE_HINTS = ["socket hang up", "ECONNRESET", "EPIPE"];

const ABORT_NAMES = new Set(["AbortError", "TimeoutError"]);
const ABORT_MESSAGE_RE = /\babort(ed|ing)?\b|\bcancel(led|ed|ing)?\b|client (disconnected|closed)/i;

const MAX_CAUSE_DEPTH = 4;

/**
 * Walk an error and its cause chain. Returns a normalized reset code
 * ("ECONNRESET" | "EPIPE" | "UND_ERR_SOCKET" | "SOCKET_HANG_UP") when any
 * node is an upstream socket reset; null when it is not (client abort,
 * deadline abort, DNS failure, timeout, plain error, ...).
 *
 * An explicit abort anywhere in the chain wins over reset-like text nested
 * inside it: a deadline-aborted fetch whose ancient cause mentions a socket
 * is still an abort, not an upstream reset.
 *
 * @param {unknown} error
 * @returns {string|null}
 */
export function getUpstreamResetCode(error) {
  if (!error || typeof error !== "object") return null;
  let node = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && node && typeof node === "object"; depth++) {
    const name = typeof node.name === "string" ? node.name : "";
    const message = typeof node.message === "string" ? node.message : "";
    if (ABORT_NAMES.has(name) || ABORT_MESSAGE_RE.test(message)) return null;
    if (typeof node.code === "string" && RESET_CODES.has(node.code)) return node.code;
    const hint = RESET_MESSAGE_HINTS.find((h) => message.includes(h));
    if (hint) return hint === "socket hang up" ? "SOCKET_HANG_UP" : hint;
    const next = node.cause;
    if (!next || next === node) break;
    node = next;
  }
  return null;
}

/**
 * Strip URL credentials (userinfo + query string) from a URL for logging.
 * openai-compatible connections encode the token in the URL userinfo and some
 * providers use query strings; host + path stay so the entry stays
 * diagnosable. Non-URL strings fall back to a conservative mask.
 *
 * @param {unknown} url
 * @returns {string|null|undefined}
 */
export function maskUrlSecrets(url) {
  if (typeof url !== "string" || !url) return url;
  try {
    const parsed = new URL(url);
    if (parsed.username) parsed.username = "";
    if (parsed.password) parsed.password = "";
    if (parsed.search) parsed.search = "";
    return parsed.toString();
  } catch {
    return url.replace(/\/\/[^/@]*:[^/@]*@/, "//***@").split("?")[0];
  }
}
