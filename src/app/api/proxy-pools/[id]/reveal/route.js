import { NextResponse } from "next/server";
import { getProxyPoolById } from "@/models";
import {
  authorizeProxyReveal,
  REVEAL_NO_STORE_HEADERS,
} from "@/lib/proxyRevealGuard.js";
import { appendAuditEvent } from "@/lib/auditLog.js";
import { hasProxyAuth } from "@/lib/proxyMask.js";

// GET /api/proxy-pools/[id]/reveal?confirm=true — single-record ONLY.
// Dashboard-auth (or CLI token), audit-logged, rate-limited, no-store.
// There is deliberately no bulk variant: one pool per request.
export async function GET(request, { params }) {
  const auth = await authorizeProxyReveal(request);
  if (auth.error) {
    const headers = { ...REVEAL_NO_STORE_HEADERS };
    if (auth.retryAfter) headers["Retry-After"] = String(auth.retryAfter);
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  }

  try {
    const { id } = await params;
    const pool = await getProxyPoolById(id);

    if (!pool || typeof pool.proxyUrl !== "string" || !pool.proxyUrl.trim()) {
      await appendAuditEvent("proxy.reveal", {
        target: "proxy-pool",
        id: String(id),
        result: "not-found",
        ip: auth.ip,
      });
      return NextResponse.json(
        { error: "Proxy pool not found" },
        { status: 404, headers: REVEAL_NO_STORE_HEADERS }
      );
    }

    await appendAuditEvent("proxy.reveal", {
      target: "proxy-pool",
      id: pool.id,
      name: pool.name,
      hasAuth: hasProxyAuth(pool.proxyUrl),
      result: "ok",
      ip: auth.ip,
    });
    return NextResponse.json(
      { id: pool.id, proxyUrl: pool.proxyUrl },
      { headers: REVEAL_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.log("Error revealing proxy pool URL:", error);
    return NextResponse.json(
      { error: "Failed to reveal proxy URL" },
      { status: 500, headers: REVEAL_NO_STORE_HEADERS }
    );
  }
}
