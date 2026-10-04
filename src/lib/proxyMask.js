// Proxy secret masking — CLIENT-SAFE (no node imports).
// Proxy URLs embed credentials (scheme://user:pass@host:port). The browser
// must never receive the userinfo part. Servers keep the full URL; every
// dashboard API response carries only an appropriate censored form + a hasAuth flag.

/**
 * Mask a proxy URL for browser display/API responses.
 * - `http://user:pass@host:8080` -> `http://***@host:8080`
 * - query string always redacted (`?token=...` -> `?***`) — relay URLs carry
 *   secrets outside userinfo (W16); a query is never needed to identify a pool.
 * - fragment always dropped.
 * - path is kept (routing info for relays); a full-path secret is
 *   indistinguishable from routing and stays a documented limitation.
 * - no userinfo/query/fragment -> returned as-is (for non-pool contexts only)
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

/**
 * Fully censor a proxy-pool URL for list/card responses. Proxy endpoints and
 * relay hostnames are sensitive routing infrastructure, not safe identifiers.
 */
export function censorProxyPoolUrl(url) {
  if (url === undefined || url === null) return undefined;
  return String(url).trim() ? "***" : "";
}

/**
 * Remove credential material and network locations from text that can cross a
 * persistence or browser boundary. This helper is deliberately client-safe so
 * the same policy can be applied defensively by UI consumers.
 */
export function redactSensitiveText(value) {
  if (value === undefined || value === null) return value;
  let text = String(value);

  // Whole URLs may contain userinfo, tokens, paths, query parameters and hosts.
  text = text.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>'"`]+/gi, "[REDACTED_URL]");
  // Common explicit credentials and bearer values. Quoted JSON properties are
  // handled separately so their closing quote cannot become part of a secret.
  text = text.replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]");
  text = text.replace(/(["'])(api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|authorization|password|passwd|secret|token|auth|bearer|credential)\1\s*:\s*(["'])[^"']*\3/gi, '$1$2$1:$3[REDACTED]$3');
  text = text.replace(/\b(api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|authorization|password|passwd|secret|token|auth|bearer|credential)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$1=[REDACTED]");
  // Well-known key/token shapes, including prefixes used by providers in this
  // registry. Keep this explicit: it catches keys even without contextual words.
  text = text.replace(/\b(?:(?:sk|pk|rk)-?|gsk_|xai-|tvo-|tp-|pt-|hf_|user_|auth1_|gh[oprsu]-?|xox[baprs]-?)[A-Za-z0-9_-]{12,}\b/gi, "[REDACTED_KEY]");
  text = text.replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_KEY]");
  text = text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_TOKEN]");

  // Generic fallback for provider formats not yet known to the registry. A
  // key-ish label permits any long token shape; standalone values additionally
  // need mixed character classes and high Shannon entropy to avoid prose/model IDs.
  text = text.replace(/\b(key|token|secret|credential|auth|bearer)\b(\s*(?:is\s+|was\s+)?[:=]?\s+)([A-Za-z0-9_-]{20,})/gi, "$1$2[REDACTED]");
  text = text.replace(/\b[A-Za-z0-9_-]{20,}\b/g, (candidate) => {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) return candidate;
    const classes = [/[a-z]/.test(candidate), /[A-Z]/.test(candidate), /\d/.test(candidate), /[_-]/.test(candidate)]
      .filter(Boolean).length;
    if (classes < 3) return candidate;
    const counts = new Map();
    for (const char of candidate) counts.set(char, (counts.get(char) || 0) + 1);
    const entropy = [...counts.values()].reduce((sum, count) => {
      const probability = count / candidate.length;
      return sum - probability * Math.log2(probability);
    }, 0);
    return entropy >= 4 ? "[REDACTED_TOKEN]" : candidate;
  });
  // Bare proxy userinfo, IP addresses and hostnames are infrastructure secrets.
  text = text.replace(/\b[^\s:@/]+:[^\s@/]+@(?:\[[^\]]+\]|[^\s/:]+)(?::\d+)?\b/g, "[REDACTED_PROXY]");
  text = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, "[REDACTED_IP]");
  text = text.replace(/\b(?:localhost|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d{1,5})?\b/gi, "[REDACTED_HOST]");
  return text;
}

export function sanitizeProxyPoolFields(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = { ...obj };
  if (out.proxyUrl !== undefined) {
    const raw = out.proxyUrl;
    delete out.proxyUrl;
    out.proxyUrlMasked = censorProxyPoolUrl(raw);
    out.hasProxyAuth = hasProxyAuth(raw);
  }
  if (out.noProxy !== undefined) {
    out.noProxy = String(out.noProxy).trim() ? "***" : "";
  }
  if (out.lastError !== undefined) {
    out.lastError = redactSensitiveText(out.lastError);
  }
  return out;
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
