import { NextResponse } from "next/server";
const ALLOWED_DOMAINS = [
    "example.com",
    "googleusercontent.com",
    "ytimg.com",
    "vimeocdn.com",
    "cloudflare.com",
    "replicate.delivery",
    "replicate.com",
    "cloudflare-ipfs.com",
    "runway.ml",
    "runwayml.com",
    "kling.kuaishou.com",
    "api.kling.ai",
    "klingai.com",
    "hailuoai.com",
    "minimaxi.com",
];
function isAllowedUrl(urlStr) {
    try {
        const { hostname } = new URL(urlStr);
        return ALLOWED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
    }
    catch {
        return false;
    }
}

// GET /api/media-proxy?url=<encoded_url>
// Server-side proxy for CDN URLs (bypass CORS). Ported from 9router-v3 (Next-native).
export async function GET(req) {
    try {
        const searchParams = new URL(req.url).searchParams;
        const url = searchParams.get("url");
        if (!url) {
            return new NextResponse(JSON.stringify({ error: "Missing url param" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        let decodedUrl;
        try {
            decodedUrl = decodeURIComponent(url);
        }
        catch {
            return new NextResponse(JSON.stringify({ error: "Invalid url encoding" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        if (!isAllowedUrl(decodedUrl)) {
            return new NextResponse(JSON.stringify({ error: "Domain not allowed" }), { status: 403, headers: { "Content-Type": "application/json" } });
        }
        const rangeHeader = req.headers.get("range");
        const upstream = await fetch(decodedUrl, {
            headers: {
                ...(rangeHeader ? { Range: rangeHeader } : {}),
            },
        });
        if (!upstream.ok && upstream.status !== 206) {
            return new NextResponse(null, { status: upstream.status });
        }
        const contentType = upstream.headers.get("content-type") || "video/mp4";
        const contentLength = upstream.headers.get("content-length");
        const contentRange = upstream.headers.get("content-range");
        const acceptRanges = upstream.headers.get("accept-ranges") || "bytes";
        const headers = new Headers({
            "Content-Type": contentType,
            "Accept-Ranges": acceptRanges,
        });
        if (contentLength)
            headers.set("Content-Length", contentLength);
        if (contentRange)
            headers.set("Content-Range", contentRange);
        return new NextResponse(upstream.body, {
            status: upstream.status,
            headers,
        });
    }
    catch (err) {
        console.error("[media-proxy] Fetch error:", err.message);
        return new NextResponse(JSON.stringify({ error: "Upstream fetch failed" }), { status: 502, headers: { "Content-Type": "application/json" } });
    }
}

export async function HEAD(request) {
    return GET(request);
}
