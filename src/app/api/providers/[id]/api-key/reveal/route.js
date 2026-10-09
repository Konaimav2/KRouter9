import { NextResponse } from "next/server";
import { getProviderConnectionById } from "@/models";
import {
  authorizeProxyReveal,
  REVEAL_NO_STORE_HEADERS,
} from "@/lib/proxyRevealGuard.js";
import { appendAuditEvent } from "@/lib/auditLog.js";

export const dynamic = "force-dynamic";

// GET /api/providers/[id]/api-key/reveal?confirm=true — single-record ONLY.
// Returns the connection's UPSTREAM api-key-auth credential (the `apiKey`
// field) and NOTHING else: never access/refresh/id tokens, never proxy URLs,
// never the full connection record.
// Route-local auth via authorizeProxyReveal: dashboard session or CLI token,
// INDEPENDENT of settings.requireLogin; gateway bearer keys NEVER authorize.
// Bounded id, reveal limiter w/ 429, metadata audit, no-store on ALL paths.
// No bulk variant — one connection per request. Non-apikey connections
// (non-apikey/no-auth) 404 with a metadata audit, same as missing.
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
      await appendAuditEvent("provider.apikey.reveal", {
        target: "connection",
        id: String(id ?? ""),
        result: "not-found",
        ip: auth.ip,
      });
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404, headers: REVEAL_NO_STORE_HEADERS }
      );
    }
    const connection = await getProviderConnectionById(id);

    if (!connection) {
      await appendAuditEvent("provider.apikey.reveal", {
        target: "connection",
        id: String(id),
        result: "not-found",
        ip: auth.ip,
      });
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404, headers: REVEAL_NO_STORE_HEADERS }
      );
    }

    const apiKey = typeof connection.apiKey === "string" ? connection.apiKey : "";
    if (connection.authType !== "apikey" || !apiKey.trim()) {
      await appendAuditEvent("provider.apikey.reveal", {
        target: "connection",
        id: connection.id,
        provider: connection.provider,
        authType: connection.authType,
        result: "no-apikey",
        ip: auth.ip,
      });
      return NextResponse.json(
        { error: "No API key stored for this connection" },
        { status: 404, headers: REVEAL_NO_STORE_HEADERS }
      );
    }

    await appendAuditEvent("provider.apikey.reveal", {
      target: "connection",
      id: connection.id,
      provider: connection.provider,
      result: "ok",
      ip: auth.ip,
    });
    return NextResponse.json(
      { id: connection.id, provider: connection.provider, apiKey },
      { headers: REVEAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.log("Error revealing provider API key:", error);
    return NextResponse.json(
      { error: "Failed to reveal API key" },
      { status: 500, headers: REVEAL_NO_STORE_HEADERS }
    );
  }
}
