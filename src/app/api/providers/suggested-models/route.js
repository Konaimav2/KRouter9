import { NextResponse } from "next/server";
import { FILTERS } from "./filters.js";
import { hasValidDashboardSession } from "@/lib/proxyRevealGuard.js";
import { getProviderConnections } from "@/lib/localDb";

export const dynamic = "force-dynamic";

// Resolve a server-side API key for key-gated catalogs without ever exposing it:
// dashboard-authed callers may pass `provider` (registry id); the first active
// apikey connection supplies the upstream Authorization header. No key material
// appears in URLs, logs, or responses. Fail-open: anything missing → [].
async function resolveCatalogApiKey(request, provider) {
  try {
    if (!provider || !(await hasValidDashboardSession(request))) return null;
    const conns = await getProviderConnections({ provider, isActive: true });
    const hit = (Array.isArray(conns) ? conns : []).find(
      (c) => typeof c?.apiKey === "string" && c.apiKey.trim() !== ""
    );
    return hit ? hit.apiKey : null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const type = searchParams.get("type");

  if (!url || !type) {
    return NextResponse.json({ error: "Missing url or type" }, { status: 400 });
  }

  const filter = FILTERS[type];
  if (!filter) {
    return NextResponse.json({ error: "Unknown filter type" }, { status: 400 });
  }

  // Optional keyed catalogs (e.g. /v1/models behind an API key): `provider`
  // triggers a dashboard-authed server-side key lookup. Providers with no
  // apikey connection fall back to an unauthenticated fetch (public catalogs);
  // key-gated upstreams fail open to [] via non-OK status. Never the key,
  // never an error.
  const provider = searchParams.get("provider");
  let headers;
  if (provider) {
    // Keyless/public catalogs have no apikey connection — fall back to an
    // unauthenticated fetch instead of starving them with an immediate [].
    // Truly key-gated catalogs still fail open: upstream 401 → [] below.
    const apiKey = await resolveCatalogApiKey(request, provider);
    if (apiKey) headers = { Authorization: `Bearer ${apiKey}` };
  }

  try {
    const res = await fetch(url, headers ? { headers } : undefined);
    if (!res.ok) {
      return NextResponse.json({ data: [] });
    }
    const json = await res.json();
    const raw = json.data ?? json.models ?? json;
    const data = filter(Array.isArray(raw) ? raw : []);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
