// Proxy secret masking — CLIENT-SAFE (no node imports).
// Proxy URLs embed credentials (scheme://user:pass@host:port). The browser
// must never receive the userinfo part. Servers keep the full URL; every
// dashboard API response carries only the masked form + a hasAuth flag.

/**
 * Mask a proxy URL for browser display/API responses.
 * - `http://user:pass@host:8080` -> `http://***@host:8080`
 * - query string always redacted (`?token=...` -> `?***`) — relay URLs carry
 *   secrets outside userinfo (W16); a query is never needed to identify a pool.
 * - fragment always dropped.
 * - path is kept (routing info for relays); a full-path secret is
 *   indistinguishable from routing and stays a documented limitation.
 * - no userinfo/query/fragment -> returned as-is (host:port is not secret)
 * - unparseable/empty -> "***" / ""
 */
export function maskProxyUrl(url) {
  if (url === undefined || url === null) return undefined;
  const s = String(url).trim();
  if (!s) return "";
  try {
    // Split scheme://rest without requiring a valid URL parse (proxies can
    // be socks5:// or bare host:port).
    const m = s.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)?(.*)$/);
    const scheme = m[1] || "";
    let rest = m[2] || "";
    // Drop fragment: never identifying, sometimes secret.
    const hash = rest.indexOf("#");
    if (hash !== -1) rest = rest.slice(0, hash);
    // Redact query: relay tokens/keys live here (?token=, ?api_key=).
    const q = rest.indexOf("?");
    let suffix = "";
    if (q !== -1) {
      suffix = "?***";
      rest = rest.slice(0, q);
    }
    const at = rest.lastIndexOf("@");
    if (at === -1) return `${scheme}${rest}${suffix}`;
    const hostport = rest.slice(at + 1);
    if (!hostport) return "***";
    return `${scheme}***@${hostport}${suffix}`;
  } catch {
    return "***";
  }
}

export function hasProxyAuth(url) {
  if (!url || typeof url !== "string") return false;
  const s = url.trim();
  const m = s.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(.*)$/);
  const rest = m ? m[1] : s;
  const at = rest.lastIndexOf("@");
  return at > 0;
}

/**
 * Strip the raw proxy URL from an object, adding masked + flag fields.
 * `urlKey` is the raw field name (deleted); masked form goes to `maskedKey`.
 */
export function sanitizeProxyFields(obj, urlKey = "proxyUrl", maskedKey = "proxyUrlMasked") {
  if (!obj || typeof obj !== "object") return obj;
  const out = { ...obj };
  if (out[urlKey] !== undefined) {
    const raw = out[urlKey];
    delete out[urlKey];
    out[maskedKey] = maskProxyUrl(raw);
    out.hasProxyAuth = hasProxyAuth(raw);
  }
  return out;
}

/**
 * Strip a connection record for browser responses: removes key/token material
 * and the raw legacy per-connection proxy URL, exposing only masked form.
 */
export function sanitizeConnectionForBrowser(c) {
  if (!c || typeof c !== "object") return c;
  const out = { ...c };
  delete out.apiKey;
  delete out.accessToken;
  delete out.refreshToken;
  delete out.idToken;
  const psd = out.providerSpecificData;
  if (psd && typeof psd === "object") {
    const { connectionProxyUrl, ...rest } = psd;
    out.providerSpecificData = connectionProxyUrl !== undefined
      ? {
          ...rest,
          connectionProxyUrlMasked: maskProxyUrl(connectionProxyUrl),
          hasConnectionProxyAuth: hasProxyAuth(connectionProxyUrl),
        }
      : rest;
  }
  for (const k of Object.keys(out)) {
    if (k.startsWith("modelLock_")) delete out[k];
  }
  return out;
}
