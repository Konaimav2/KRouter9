import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import net from "node:net";
import { Readable } from "node:stream";
import { getSettings } from "@/lib/localDb";
import { DEFAULT_HEADROOM_URL } from "@/lib/headroom/detect";
import { isPrivateOrLoopback, requestPinned } from "@/lib/headroom/pinnedRequest";

export const dynamic = "force-dynamic";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const DASHBOARD_PREFIX = "/api/headroom/proxy";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

async function getTargetBase() {
  const settings = await getSettings();
  const url = settings.headroomUrl || DEFAULT_HEADROOM_URL;
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("Headroom URL must use http or https");
  }
  // Headroom is a local sidecar. Refuse anything that resolves outside loopback or
  // RFC1918 space, so this route can never be pointed at cloud metadata or the
  // public internet. Link-local (169.254.0.0/16, fe80::/10) is always rejected.
  const host = target.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address);
  if (!addresses.length || addresses.some((address) => !isPrivateOrLoopback(address))) {
    throw new Error("Headroom URL must resolve to a loopback or private address");
  }
  // Pin the addresses that were just validated. The socket must never resolve the
  // hostname again, otherwise a rebinding answer bypasses this check.
  return { target, addresses };
}

function buildTargetUrl(base, path, search) {
  const target = new URL(base);
  target.pathname = `/${path.join("/")}`;
  target.search = search;
  return target;
}

function forwardedHeaders(request, target) {
  const headers = new Headers(request.headers);
  for (const header of headers.keys()) {
    if (HOP_BY_HOP_HEADERS.has(header.toLowerCase())) headers.delete(header);
  }
  headers.delete("host");
  // Never leak viewer credentials to a non-loopback Headroom host
  if (!LOOPBACK_HOSTS.has(target.hostname.replace(/^\[|\]$/g, "").toLowerCase())) {
    headers.delete("cookie");
    headers.delete("authorization");
  }
  return headers;
}

function rewriteDashboardHtml(html) {
  return html.replace(
    /fetch\('(?=\/(?:stats|health|stats-history|transformations\/feed))/g,
    `fetch('${DASHBOARD_PREFIX}`,
  );
}

async function readBody(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function proxy(request, { params }) {
  try {
    const { target: base, addresses } = await getTargetBase();
    const { search } = new URL(request.url);
    const path = (await params).path || [];
    const target = buildTargetUrl(base, path, search);
    const method = request.method;
    const hasBody = !["GET", "HEAD"].includes(method);

    const response = await requestPinned(target, {
      method,
      headers: Object.fromEntries(forwardedHeaders(request, target).entries()),
      body: hasBody ? request.body : null,
      addresses,
    });

    const headers = new Headers();
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined) {
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
    }
    for (const header of [...headers.keys()]) {
      if (HOP_BY_HOP_HEADERS.has(header.toLowerCase())) headers.delete(header);
    }

    if (path.join("/") === "dashboard") {
      const contentType = headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        headers.delete("content-length");
        return new NextResponse(rewriteDashboardHtml(await readBody(response)), {
          status: response.statusCode,
          headers,
        });
      }
    }

    return new NextResponse(Readable.toWeb(response), { status: response.statusCode, headers });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
