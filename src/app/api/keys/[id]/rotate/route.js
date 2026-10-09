import { NextResponse } from "next/server";
import { getApiKeyById, rotateApiKey, sanitizeApiKeyRow } from "@/lib/localDb";
import { hasValidDashboardSession, REVEAL_NO_STORE_HEADERS } from "@/lib/proxyRevealGuard.js";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { getClientIp } from "@/lib/auth/loginLimiter.js";
import { checkRevealRateLimit } from "@/lib/revealRateLimit.js";

export const dynamic = "force-dynamic";

// Strict dashboard/CLI auth INDEPENDENT of settings.requireLogin — same
// controls as the reveal guard (session or CLI token + IP rate limit),
// minus ?confirm=true (rotation is already an explicit POST).
async function authorizeKeyRotate(request) {
  let authed = false;
  try {
    authed = await hasValidDashboardSession(request);
  } catch {
    authed = false;
  }
  if (!authed) {
    try {
      const token = request.headers.get("x-9r-cli-token");
      authed = !!token && token === (await getConsistentMachineId("9r-cli-auth"));
    } catch {
      authed = false;
    }
  }
  if (!authed) return { error: "Unauthorized", status: 401 };
  const ip = getClientIp(request);
  const rl = checkRevealRateLimit(`key-rotate:${ip}`);
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

// POST /api/keys/[id]/rotate — issue a fresh key string for the same id.
// Old string stops working immediately. Strict auth (see above); the fresh
// raw string is returned ONCE, afterwards only via the reveal endpoint.
// Responses carry Cache-Control: no-store.
export async function POST(request, { params }) {
  const auth = await authorizeKeyRotate(request);
  if (auth.error) {
    const headers = { ...REVEAL_NO_STORE_HEADERS };
    if (auth.retryAfter) headers["Retry-After"] = String(auth.retryAfter);
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  }
  try {
    const { id } = await params;
    if (typeof id !== "string" || !id || id.length > 128 || id.includes("/") || id.includes("..")) {
      return NextResponse.json(
        { error: "Key not found" },
        { status: 404, headers: REVEAL_NO_STORE_HEADERS }
      );
    }
    const existing = await getApiKeyById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Key not found" },
        { status: 404, headers: REVEAL_NO_STORE_HEADERS }
      );
    }
    const rotated = await rotateApiKey(id);
    return NextResponse.json(
      {
        key: rotated.key,
        rotated: true,
        id: rotated.id,
        name: rotated.name,
        rotatedMeta: sanitizeApiKeyRow(rotated),
      },
      { headers: REVEAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.log("Error rotating key:", error);
    return NextResponse.json(
      { error: "Failed to rotate key" },
      { status: 500, headers: REVEAL_NO_STORE_HEADERS }
    );
  }
}
