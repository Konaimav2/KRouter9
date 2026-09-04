/**
 * AgentRouter Proxy Engine
 *
 * Reverse proxy that forwards requests to agentrouter.org while bypassing
 * Alibaba Cloud WAF.  Operates standalone HTTP server on the configured
 * port so AI clients point their OpenAI-compatible base URL at it.
 *
 * WAF bypass:
 *   - User-Agent  : codex_cli_rs/0.101.0  (whitelisted by agentrouter's WAF)
 *   - Originator  
 *   - acw_tc cookie , refreshed every 15 min
 */

import http from "node:http";
import { request } from "undici";

// ── Config defaults ───────────────────────────────────────────────────────────


export const DEFAULT_CONFIG
  upstreamBase:      process.env.AGENTROUTER_UPSTREAM    || "https://agentrouter.org",
  listenHost:        process.env.AGENTROUTER_HOST        || "0.0.0.0",
  listenPort:        Number(process.env.AGENTROUTER_PORT || "8318"),
  maskUserAgent:     process.env.AGENTROUTER_UA          || "codex_cli_rs/0.101.0",
  maskOriginator
  dropRequestHeaders, "content-length", "connection", "transfer-encoding", "user-agent"],
  dropResponseHeaders: ["content-encoding", "transfer-encoding", "set-cookie"],
  cookieRefreshMinutes: 15,
};

// ── Cookie manager ────────────────────────────────────────────────────────────

let _wafCookie;
let _cookieTimer;
let _cookieFetchedAt = 0;

async function fetchAcwTcCookie(upstreamBase)
  try {
    const res = await undiciRequest(upstreamBase + "/", {
      method
      headers
        "user-agent"
        "accept": "text/html",
      },
      maxRedirections: 2,
    });
    const setCookie = res.headers["set-cookie"] || res.headers["Set-Cookie"];
    const cookie = Array.isArray(setCookie) ? setCookie.join("; ") ;

    // Extract acw_tc cookie
    if (cookie) {
      const m = cookie.match(/acw_tc=([^;]+)/);
      if (m) return m[0]; // "acw_tc=..."
    }
    // Consume body
    try {
      for await (const _chunk of res.body) { /* drain */ }
    } catch { /* ignore */ }
    return null;
  } catch (err) {
    console.log("[agentrouter-proxy] Cookie fetch failed:", (err).message);
    return null;
  }
}

function startCookieRefresh(upstreamBase, intervalMin)
  stopCookieRefresh();
  // Fetch immediately
  fetchAcwTcCookie(upstreamBase).then(c => {
    if (c) { _wafCookie = c; _cookieFetchedAt = Date.now(); }
  });
  // Periodic refresh
  _cookieTimer = setInterval(async () => {
    const c = await fetchAcwTcCookie(upstreamBase);
    if (c) { _wafCookie = c; _cookieFetchedAt = Date.now(); }
  }, intervalMin * 60 * 1000);
}

function stopCookieRefresh()
  if (_cookieTimer) { clearInterval(_cookieTimer); _cookieTimer = null; }
  _wafCookie = null;
}

export function getCookieStatus(): { cookie; fetchedAt
  return { cookie: _wafCookie ? "present" , fetchedAt;
}

// ── Header helpers ────────────────────────────────────────────────────────────

const DROP_REQ = new Set(DEFAULT_CONFIG.dropRequestHeaders.map(h => h.toLowerCase()));
const DROP_RES = new Set(DEFAULT_CONFIG.dropResponseHeaders.map(h => h.toLowerCase()));

function buildUpstreamHeaders(
  incomingHeaders
  config
)
  const headers;

  for (const [key, val] of Object.entries(incomingHeaders)) {
    const lk = key.toLowerCase();
    if (DROP_REQ.has(lk)) continue;
    if (val === undefined) continue;
    headers[key] = Array.isArray(val) ? val.join(", ") ;
  }

  // WAF-bypass overrides
  headers["user-agent"] = config.maskUserAgent;
  headers["originator"] = config.maskOriginator;
  // Disable compression so we can stream raw bytes
  headers["accept-encoding"] = "identity";

  // Attach WAF cookie if available
  if (_wafCookie) {
    const existing = headers["cookie"] || "";
    headers["cookie"] = existing ? `${existing}; ${_wafCookie}` ;
  }

  return headers;
}

function filterResponseHeaders(
  upstreamHeaders
)
  const headers;
  for (const [key, val] of Object.entries(upstreamHeaders)) {
    const lk = key.toLowerCase();
    if (DROP_RES.has(lk)) continue;
    if (val === undefined) continue;
    headers[key] = Array.isArray(val) ? val.join(", ") ;
  }
  return headers;
}

// ── Proxy server ──────────────────────────────────────────────────────────────

let _server;
let _activeConfig;

// Log buffer for dashboard
const _logBuffer: { ts; method; path; status; duration;
const MAX_LOG = 500;
let _requestCount = 0;
let _totalLatency = 0;

export function getLogs() {
  return [..._logBuffer].reverse();
}

export function getStats() {
  return {
    running: _server !== null,
    port
    requestCount
    avgLatencyMs: _requestCount ? Math.round(_totalLatency / _requestCount) : 0,
    cookieAgeSec) - _cookieFetchedAt) / 1000) : -1,
  };
}

export function getConfig()
  return { ..._activeConfig };
}

function addLog(method, path, status, duration
  _logBuffer.push({ ts;
  if (_logBuffer.length > MAX_LOG) _logBuffer.shift();
  _requestCount++;
  _totalLatency += duration;
}

export async function startProxy(config?)
  if (_server) throw new Error("Proxy already running");

  _activeConfig = { ...DEFAULT_CONFIG, ...config };

  // Start cookie refresh
  startCookieRefresh(_activeConfig.upstreamBase, _activeConfig.cookieRefreshMinutes);

  _server = http.createServer(async (req, res) => {
    const start = Date.now();
    const targetUrl = _activeConfig.upstreamBase + (req.url || "/");

    try {
      // Read body
      const chunks;
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk ;
      }
      const body = Buffer.concat(chunks);

      const upstreamHeaders = buildUpstreamHeaders(req.headers, _activeConfig);

      const upstreamRes = await undiciRequest(targetUrl, {
        method
        headers
        body: body.length > 0 ? body 
        maxRedirections: 0,
      });

      const resHeaders = filterResponseHeaders(upstreamRes.headers);
      res.writeHead(upstreamRes.statusCode, resHeaders);

      // Stream body
      for await (const chunk of upstreamRes.body) {
        res.write(chunk);
      }
      res.end();

      addLog(req.method || "GET", req.url || "/", upstreamRes.statusCode, Date.now() - start);
    } catch (err) {
      const msg = (err).message;
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error, detail;
      } else {
        res.end();
      }
      addLog(req.method || "GET", req.url || "/", 502, Date.now() - start);
    }
  });

  return new Promise((resolve, reject) => {
    _server.on("error", reject);
    _server.listen(_activeConfig.listenPort, _activeConfig.listenHost, () => {
      console.log(`[agentrouter-proxy] Listening on http://${_activeConfig.listenHost}:${_activeConfig.listenPort} -> ${_activeConfig.upstreamBase}`);
      resolve(_activeConfig);
    });
  });
}

export async function stopProxy()
  stopCookieRefresh();
  if (!_server) return;
  return new Promise((resolve, reject) => {
    _server.close((err) => {
      if (err) return reject(err);
      _server = null;
      resolve();
    });
  });
}

export function isRunning()
  return _server !== null;
}
