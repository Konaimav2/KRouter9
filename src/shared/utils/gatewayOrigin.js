// Gateway origin for copy-paste snippets (curl, client config, MITM target).
//
// Client: the page's own origin, so snippets show the port the dashboard is
// really served on. Server render: NEXT_PUBLIC_BASE_URL, else the documented
// default. The default below is the only hardcoded port in the dashboard UI
// and is reached during SSR only. Components that print the origin as visible
// text should resolve it after mount to avoid a hydration mismatch.

const SSR_FALLBACK_ORIGIN = "http://localhost:20128";

// Same value, for a hydration-safe first render; swap in getGatewayOrigin()
// after mount.
export const DEFAULT_GATEWAY_ORIGIN = SSR_FALLBACK_ORIGIN;

function configuredBaseUrl() {
  try {
    return process.env.NEXT_PUBLIC_BASE_URL || "";
  } catch {
    return "";
  }
}

// True when `url` is the documented default gateway origin (what server-side
// settings report when nothing was configured), in either localhost or
// loopback spelling. Lets the UI show the real page origin instead.
export function isDefaultGatewayOrigin(url) {
  const value = String(url || "").trim().replace(/\/+$/, "").toLowerCase();
  if (!value) return false;
  const fallback = SSR_FALLBACK_ORIGIN.toLowerCase();
  return value === fallback || value === fallback.replace("//localhost", "//127.0.0.1");
}

export function getGatewayOrigin({ loopback = false } = {}) {
  let origin = "";
  const pageOrigin = typeof window !== "undefined" ? window?.location?.origin : "";
  if (pageOrigin && pageOrigin !== "null") origin = pageOrigin;
  else origin = configuredBaseUrl() || SSR_FALLBACK_ORIGIN;
  origin = origin.replace(/\/+$/, "");
  if (loopback) origin = origin.replace(/^(https?:\/\/)localhost(?=[:/]|$)/i, "$1127.0.0.1");
  return origin;
}
