// Normalized connection error classes (U1c decided taxonomy).
// auth-invalid / refresh-invalid / ratelimited / network / unknown.
// Pure module — safe for client + server + unit tests.
export const ERROR_CLASSES = [
  "auth-invalid",
  "refresh-invalid",
  "ratelimited",
  "network",
  "unknown",
];

export function normalizeErrorClass(input = {}) {
  const status = String(input.testStatus || input.status || "").toLowerCase();
  const code = Number(input.errorCode);
  const msg = String(input.lastError || input.message || "").toLowerCase();
  const refreshFailed = input.refreshFailed === true;

  // Distinct refresh-invalid wins whenever a token refresh failed.
  if (status === "refresh-invalid" || refreshFailed) return "refresh-invalid";
  if (msg.includes("refresh") && (msg.includes("fail") || msg.includes("invalid") || msg.includes("expired"))) {
    return "refresh-invalid";
  }

  if (status === "429" || Number.isFinite(code) && code === 429) return "ratelimited";
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("too many requests")) {
    return "ratelimited";
  }

  if (
    status === "401" || status === "403" ||
    (Number.isFinite(code) && (code === 401 || code === 403)) ||
    msg.includes("invalid api key") || msg.includes("token invalid") ||
    msg.includes("revoked") || msg.includes("unauthorized") ||
    msg.includes("auth") && msg.includes("invalid") ||
    msg.includes("expired") && (msg.includes("token") || msg.includes("key"))
  ) {
    return "auth-invalid";
  }

  if (
    msg.includes("network") || msg.includes("econn") || msg.includes("etimedout") ||
    msg.includes("enotfound") || msg.includes("socket") || msg.includes("fetch failed") ||
    msg.includes("timeout") || msg.includes("dns")
  ) {
    return "network";
  }

  if (!status && !msg && !Number.isFinite(code)) return "unknown";
  return "unknown";
}

export function errorClassLabel(cls) {
  switch (cls) {
    case "auth-invalid": return "Auth invalid";
    case "refresh-invalid": return "Refresh invalid";
    case "ratelimited": return "Rate limited";
    case "network": return "Network";
    default: return "Unknown";
  }
}

// Badge variant mapping for the shared Badge component.
export function errorClassVariant(cls) {
  switch (cls) {
    case "auth-invalid":
    case "refresh-invalid":
      return "error";
    case "ratelimited":
      return "warning";
    case "network":
      return "info";
    default:
      return "default";
  }
}
