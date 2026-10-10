import { NextResponse } from "next/server";
import { normalizeApiKeyExpiry } from "@/lib/db/repos/apiKeysRepo.js";
import { getApiKeys, createApiKey, sanitizeApiKeyRow } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { hasValidDashboardSession, REVEAL_NO_STORE_HEADERS } from "@/lib/proxyRevealGuard.js";
import { getClientIp } from "@/lib/auth/loginLimiter.js";
import { checkRevealRateLimit } from "@/lib/revealRateLimit.js";

export const dynamic = "force-dynamic";

// Strict dashboard/CLI auth INDEPENDENT of settings.requireLogin: a
// login-disabled instance must not let anyone mint gateway credentials.
// Same session + CLI-token + IP rate-limit controls as the reveal guard,
// minus the ?confirm=true query (creation is already an explicit POST).
async function authorizeKeyCreate(request) {
  const authed =
    (await hasValidDashboardSession(request).catch(() => false)) ||
    (await hasValidCliToken(request));
  if (!authed) return { error: "Unauthorized", status: 401 };
  const ip = getClientIp(request);
  const rl = checkRevealRateLimit(`key-create:${ip}`);
  if (!rl.ok) {
    return {
      error: "Too many attempts. Try again shortly.",
      status: 429,
      retryAfter: rl.retryAfterSec,
      ip,
    };
  }
  return { ip };
}

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

// GET /api/keys - List API-key metadata + server mask only. Raw gateway key
// strings NEVER leave this route; single-record reads go through
// GET /api/keys/[id]/reveal?confirm=true (dashboard-auth, audited, limited).
// Every response on this route carries Cache-Control: no-store.
export async function GET() {
  try {
    const keys = await getApiKeys();
    return NextResponse.json(
      { keys: keys.map(sanitizeApiKeyRow) },
      { headers: REVEAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.log("Error fetching keys:", error);
    return NextResponse.json(
      { error: "Failed to fetch keys" },
      { status: 500, headers: REVEAL_NO_STORE_HEADERS }
    );
  }
}

// POST /api/keys - Create new API key. Returns the raw key ONCE; afterwards
// only the guarded reveal endpoint can read it back. Responses carry
// Cache-Control: no-store.
export async function POST(request) {
  const auth = await authorizeKeyCreate(request);
  if (auth.error) {
    const headers = { ...REVEAL_NO_STORE_HEADERS };
    if (auth.retryAfter) headers["Retry-After"] = String(auth.retryAfter);
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  }
  try {
    const body = await request.json();
    const { name } = body;
    let expiresAt;
    try {
      expiresAt = normalizeApiKeyExpiry(body.expiresAt);
    } catch {
      return NextResponse.json(
        { error: "expiresAt must be a future ISO datetime with a timezone" },
        { status: 400, headers: REVEAL_NO_STORE_HEADERS }
      );
    }

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400, headers: REVEAL_NO_STORE_HEADERS }
      );
    }

    // Always get machineId from server
    const machineId = await getConsistentMachineId();
    const apiKey = await createApiKey(name, machineId, expiresAt);

    return NextResponse.json({
      key: apiKey.key,
      name: apiKey.name,
      id: apiKey.id,
      machineId: apiKey.machineId,
      expiresAt: apiKey.expiresAt,
    }, { status: 201, headers: REVEAL_NO_STORE_HEADERS });
  } catch (error) {
    console.log("Error creating key:", error);
    return NextResponse.json(
      { error: "Failed to create key" },
      { status: 500, headers: REVEAL_NO_STORE_HEADERS }
    );
  }
}
