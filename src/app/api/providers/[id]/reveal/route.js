import { NextResponse } from "next/server";
import { getProviderConnectionById, getProxyPoolById } from "@/models";
import {
  authorizeProxyReveal,
  REVEAL_NO_STORE_HEADERS,
} from "@/lib/proxyRevealGuard.js";
import { appendAuditEvent } from "@/lib/auditLog.js";

// GET /api/providers/[id]/reveal?confirm=true — single-record ONLY.
// Reveals the connection's effective proxy URL: the bound proxy pool's URL
// when one is assigned, otherwise the legacy per-connection proxy URL.
// Dashboard-auth (or CLI token), audit-logged, rate-limited, no-store.
// There is deliberately no bulk variant: one connection per request.
export async function GET(request, { params }) {
  const auth = await authorizeProxyReveal(request);
  if (auth.error) {
    const headers = { ...REVEAL_NO_STORE_HEADERS };
    if (auth.retryAfter) headers["Retry-After"] = String(auth.retryAfter);
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  }

  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);

    if (!connection) {
      await appendAuditEvent("proxy.reveal", {
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

    const psd = connection.providerSpecificData || {};
    let proxyUrl = null;
    let source = null;

    if (psd.proxyPoolId) {
      const pool = await getProxyPoolById(psd.proxyPoolId);
      if (pool && typeof pool.proxyUrl === "string" && pool.proxyUrl.trim()) {
        proxyUrl = pool.proxyUrl;
        source = "proxy-pool";
      }
    }
    if (!proxyUrl && typeof psd.connectionProxyUrl === "string" && psd.connectionProxyUrl.trim()) {
      proxyUrl = psd.connectionProxyUrl;
      source = "legacy";
    }

    if (!proxyUrl) {
      await appendAuditEvent("proxy.reveal", {
        target: "connection",
        id: connection.id,
        provider: connection.provider,
        result: "no-proxy",
        ip: auth.ip,
      });
      return NextResponse.json(
        { error: "No proxy URL stored for this connection" },
        { status: 404, headers: REVEAL_NO_STORE_HEADERS }
      );
    }

    await appendAuditEvent("proxy.reveal", {
      target: "connection",
      id: connection.id,
      provider: connection.provider,
      source,
      result: "ok",
      ip: auth.ip,
    });
    return NextResponse.json(
      { id: connection.id, proxyUrl, source },
      { headers: REVEAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.log("Error revealing connection proxy URL:", error);
    return NextResponse.json(
      { error: "Failed to reveal proxy URL" },
      { status: 500, headers: REVEAL_NO_STORE_HEADERS }
    );
  }
}
