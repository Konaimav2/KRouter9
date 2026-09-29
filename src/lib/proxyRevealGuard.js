// Shared guard for single-record proxy reveal endpoints.
// Single-record ONLY (?confirm=true, dashboard-auth, audit-logged,
// rate-limited, no-store, never bulk).
// Plain server-only module (node imports allowed — never import from client).
import { verifyDashboardAuthToken } from "@/lib/auth/dashboardSession.js";
import { getClientIp } from "@/lib/auth/loginLimiter.js";
import { checkRevealRateLimit } from "@/lib/revealRateLimit.js";
import { getConsistentMachineId } from "@/shared/utils/machineId.js";

export const REVEAL_NO_STORE_HEADERS = { "Cache-Control": "no-store" };

async function hasValidCliToken(request) {
  try {
    const token = request.headers.get("x-9r-cli-token");
    if (!token) return false;
    const expected = await getConsistentMachineId("9r-cli-auth");
    return token === expected;
  } catch {
    return false;
  }
}

function cookieToken(request) {
  try {
    const viaNext = request.cookies?.get?.("auth_token")?.value;
    if (viaNext) return viaNext;
  } catch {
    /* fall through to header parse */
  }
  try {
    const header = request.headers.get("cookie") || "";
    const m = header.match(/(?:^|;\s*)auth_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export async function hasValidDashboardSession(request) {
  try {
    const token = cookieToken(request);
    if (!token) return false;
    return await verifyDashboardAuthToken(token);
  } catch {
    return false;
  }
}

// Returns { ip } on success, or { error, status, retryAfter?, ip? } on reject.
// NOTE: deliberately stricter than dashboardGuard's PROTECTED_API_PATHS:
// a valid dashboard session/CLI token is required even when
// settings.requireLogin === false. Otherwise an internet-exposed instance
// would disclose proxy credentials to anyone (?confirm=true is not auth).
export async function authorizeProxyReveal(request) {
  let confirm = null;
  try {
    confirm = new URL(request.url || "http://localhost/").searchParams.get("confirm");
  } catch {
    confirm = null;
  }
  if (confirm !== "true") {
    return { error: "Confirmation required (?confirm=true)", status: 400 };
  }
  const authed =
    (await hasValidDashboardSession(request)) || (await hasValidCliToken(request));
  if (!authed) {
    return { error: "Unauthorized", status: 401 };
  }
  const ip = getClientIp(request);
  const rl = checkRevealRateLimit(ip);
  if (!rl.ok) {
    return {
      error: "Too many reveal attempts. Try again shortly.",
      status: 429,
      retryAfter: rl.retryAfterSec,
      ip,
    };
  }
  return { ip };
}
