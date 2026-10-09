import { NextResponse } from "next/server";
import { getApiKeyById } from "@/lib/localDb";
import {
  authorizeProxyReveal,
  REVEAL_NO_STORE_HEADERS,
} from "@/lib/proxyRevealGuard.js";
import { appendAuditEvent } from "@/lib/auditLog.js";

export const dynamic = "force-dynamic";

// GET /api/keys/[id]/reveal?confirm=true — single-record ONLY.
// Returns the raw gateway key string for one id. Route-local auth via
// authorizeProxyReveal: dashboard session or CLI token, INDEPENDENT of
// settings.requireLogin; gateway bearer keys (validateApiKey) NEVER
// authorize here. Bounded id, reveal limiter w/ 429, metadata audit,
// no-store on ALL paths. No bulk variant — one key per request.
export async function GET(request, { params }) {
  const auth = await authorizeProxyReveal(request);
  if (auth.error) {
    const headers = { ...REVEAL_NO_STORE_HEADERS };
    if (auth.retryAfter) headers["Retry-After"] = String(auth.retryAfter);
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  }

  try {
    const { id } = await params;
    if (typeof id !== "string" || !id || id.length > 128 || id.includes("/") || id.includes("..")) {
      await appendAuditEvent("apikey.reveal", {
        target: "api-key",
        id: String(id ?? ""),
        result: "not-found",
        ip: auth.ip,
      });
      return NextResponse.json(
        { error: "Key not found" },
        { status: 404, headers: REVEAL_NO_STORE_HEADERS }
      );
    }
    const key = await getApiKeyById(id);
    if (!key) {
      await appendAuditEvent("apikey.reveal", {
        target: "api-key",
        id: String(id),
        result: "not-found",
        ip: auth.ip,
      });
      return NextResponse.json(
        { error: "Key not found" },
        { status: 404, headers: REVEAL_NO_STORE_HEADERS }
      );
    }

    await appendAuditEvent("apikey.reveal", {
      target: "api-key",
      id: key.id,
      name: key.name,
      result: "ok",
      ip: auth.ip,
    });
    return NextResponse.json(
      { id: key.id, name: key.name, key: key.key },
      { headers: REVEAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.log("Error revealing API key:", error);
    return NextResponse.json(
      { error: "Failed to reveal API key" },
      { status: 500, headers: REVEAL_NO_STORE_HEADERS }
    );
  }
}
