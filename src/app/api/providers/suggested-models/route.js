import { NextResponse } from "next/server";
import { FILTERS } from "./filters.js";
import { hasValidDashboardSession } from "@/lib/proxyRevealGuard.js";
import { getProviderConnections } from "@/lib/localDb";
import REGISTRY from "open-sse/providers/registry/index.js";

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 10000;
const MAX_CATALOG_BYTES = 10 * 1024 * 1024;
const MAX_CATALOG_MODELS = 20000;

// HTTPS-only with no private/loopback/link-local targets. Hostnames are
// resolved at fetch time by undici, so DNS-rebinding to internal addresses
// cannot be ruled out statically — this blocks the direct literal forms.
function isPublicHttpsUrl(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan")
  ) {
    return false;
  }
  // IPv4 literals (decimal + common obfuscations).
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    const [a, b] = parts;
    if (a === 10 || a === 127) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    if (a === 0 || a >= 224) return false;
    return true;
  }
  if (/^\d+$/.test(host)) return false; // integer-form IPv4
  if (host.includes(":")) return false; // IPv6 literals incl. ::ffff:a.b.c.d
  return host.includes(".");
}

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
  const type = searchParams.get("type");

  if (!type) {
    return NextResponse.json({ error: "Missing url or type" }, { status: 400 });
  }

  const filter = FILTERS[type];
  if (!filter) {
    return NextResponse.json({ error: "Unknown filter type" }, { status: 400 });
  }

  // SSRF guard: the catalog destination is resolved server-side from the
  // provider registry — the caller-chosen `url` param is ignored. A stored
  // credential is only ever attached to that registry-bound destination, and
  // any other/loopback target fails open to []. Unknown provider → [].
  const provider = searchParams.get("provider");
  const entry = (Array.isArray(REGISTRY) ? REGISTRY : []).find(
    (r) => r?.id === provider || r?.alias === provider || r?.uiAlias === provider
  );
  const fetcher = Array.isArray(entry?.modelsFetcher)
    ? entry.modelsFetcher[0]
    : entry?.modelsFetcher;
  const url =
    typeof fetcher?.url === "string" && isPublicHttpsUrl(fetcher.url)
      ? fetcher.url
      : null;
  const fetcherType =
    typeof fetcher?.type === "string" && FILTERS[fetcher.type] ? fetcher.type : null;
  if (!url || !fetcherType || fetcherType !== type) {
    return NextResponse.json({ data: [] });
  }

  // Optional keyed catalogs (e.g. /v1/models behind an API key): `provider`
  // triggers a dashboard-authed server-side key lookup. Providers with no
  // apikey connection fall back to an unauthenticated fetch (public catalogs);
  // key-gated upstreams fail open to [] via non-OK status. Never the key,
  // never an error. The credential is attached only to the registry-bound
  // destination resolved above — never to a caller-supplied URL.
  let headers;
  if (provider) {
    // Keyless/public catalogs have no apikey connection — fall back to an
    // unauthenticated fetch instead of starving them with an immediate [].
    // Truly key-gated catalogs still fail open: upstream 401 → [] below.
    const apiKey = await resolveCatalogApiKey(request, provider);
    if (apiKey) headers = { Authorization: `Bearer ${apiKey}` };
  }

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        ...(headers ? { headers } : {}),
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(tid);
    }
    // Never follow redirects: a registry URL that redirects (301/302/307/308,
    // or meta-refresh style) off-registry would re-open the SSRF.
    if (!res.ok || (res.status >= 300 && res.status < 400)) {
      return NextResponse.json({ data: [] });
    }
    const declared = Number(res.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > MAX_CATALOG_BYTES) {
      try {
        await res.arrayBuffer?.();
      } catch {
        // ignore body-drain errors on the oversize fail-open path
      }
      return NextResponse.json({ data: [] });
    }
    const json = await res.json().catch(() => null);
    const raw = json?.data ?? json?.models ?? json;
    const list = Array.isArray(raw) ? raw.slice(0, MAX_CATALOG_MODELS) : [];
    const data = filter(list);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
