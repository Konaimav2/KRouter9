// Check if running in Node.js environment (has fs module)
const isNode = typeof process !== "undefined" && process.versions?.node && typeof window === "undefined";

// Check if logging is enabled via environment variable (default: false)
const LOGGING_ENABLED = typeof process !== "undefined" && process.env?.ENABLE_REQUEST_LOGS === 'true';

let fs = null;
let path = null;
let LOGS_DIR = null;

let lastPruneAt = null;
let pruneInProgress = false;

function positiveLimit(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function _resetPruneThrottle() {
  lastPruneAt = null;
}

// All traversal/deletion is asynchronous and serialized. Only directory entries
// are sessions: legacy daily .log files and symlinks are left untouched.
export async function pruneLogSessions(opts = {}) {
  let started = false;
  try {
    if (!isNode || pruneInProgress) return;
    const now = Date.now();
    const intervalMs = positiveLimit(opts.intervalMs ?? process.env.REQUEST_LOG_PRUNE_INTERVAL_MS, 300000);
    if (lastPruneAt !== null && now - lastPruneAt < intervalMs) return;
    lastPruneAt = now;
    pruneInProgress = true;
    started = true;

    const { promises: files } = await import("fs");
    const paths = await import("path");
    const dir = opts.dir ?? (process.env.REQUEST_LOG_DIR || paths.join(process.cwd(), "logs"));
    const retentionHours = positiveLimit(opts.retentionHours ?? process.env.REQUEST_LOG_RETENTION_HOURS, 24);
    const maxSessions = Math.floor(positiveLimit(opts.maxSessions ?? process.env.REQUEST_LOG_MAX_SESSIONS, 2000));
    const maxBytes = positiveLimit(opts.maxBytes ?? process.env.REQUEST_LOG_MAX_BYTES, 2147483648);
    const sessions = [];
    for (const entry of await files.readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sessionPath = paths.join(dir, entry.name);
      try {
        const stat = await files.lstat(sessionPath);
        if (stat.isDirectory()) sessions.push({ sessionPath, mtimeMs: stat.mtimeMs });
      } catch { /* A concurrent prune or operator may have removed it. */ }
    }
    sessions.sort((a, b) => b.mtimeMs - a.mtimeMs);

    async function directoryBytes(directory) {
      let bytes = 0;
      for (const entry of await files.readdir(directory, { withFileTypes: true })) {
        const target = paths.join(directory, entry.name);
        if (entry.isDirectory()) bytes += await directoryBytes(target);
        else if (entry.isFile()) bytes += (await files.lstat(target)).size;
      }
      return bytes;
    }

    const retained = [];
    let totalBytes = 0;
    for (const [index, session] of sessions.entries()) {
      try {
        if (session.mtimeMs < now - retentionHours * 3600000 || index >= maxSessions) {
          await files.rm(session.sessionPath, { recursive: true, force: true });
        } else {
          session.bytes = await directoryBytes(session.sessionPath);
          totalBytes += session.bytes;
          retained.push(session);
        }
      } catch { /* One unreadable session must not stop other cleanup. */ }
    }
    // Newest first above; evict from the tail until the retained bytes fit.
    for (let i = retained.length - 1; i >= 0 && totalBytes > maxBytes; i--) {
      try {
        await files.rm(retained[i].sessionPath, { recursive: true, force: true });
        totalBytes -= retained[i].bytes;
      } catch { /* Fail open, including a read-only/full filesystem. */ }
    }
  } catch {
    // Debug logging maintenance must never reject into the request path.
  } finally {
    if (started) pruneInProgress = false;
  }
}

// P3: queue append writes so streaming chunks don't block the event loop with
// synchronous fs calls mid-stream. Order per file is preserved by chaining.
// Backpressure: cap pending bytes/entries per file so a slow disk cannot grow
// the queue without bound; excess chunks are dropped (debug logs only).
const MAX_QUEUE_ENTRIES = Number(process.env.REQUEST_LOG_QUEUE_MAX) > 0
  ? Number(process.env.REQUEST_LOG_QUEUE_MAX)
  : 2000;
const appendQueues = new Map();
const appendQueueDepth = new Map();
function queueAppend(filePath, chunk) {
  if (!fs || !filePath) return;
  const depth = appendQueueDepth.get(filePath) || 0;
  if (depth >= MAX_QUEUE_ENTRIES) return; // drop under backpressure
  appendQueueDepth.set(filePath, depth + 1);
  const prev = appendQueues.get(filePath) || Promise.resolve();
  const next = prev
    .then(() => fs.promises.appendFile(filePath, chunk))
    .catch(() => {})
    .finally(() => {
      const d = (appendQueueDepth.get(filePath) || 1) - 1;
      if (d <= 0) appendQueueDepth.delete(filePath); else appendQueueDepth.set(filePath, d);
      if (appendQueues.get(filePath) === next) appendQueues.delete(filePath);
    });
  appendQueues.set(filePath, next);
}

// Lazy load Node.js modules (avoid top-level await)
async function ensureNodeModules() {
  if (!isNode || !LOGGING_ENABLED || fs) return;
  try {
    fs = await import("fs");
    path = await import("path");
    LOGS_DIR = process.env.REQUEST_LOG_DIR || path.join(typeof process !== "undefined" && process.cwd ? process.cwd() : ".", "logs");
  } catch {
    // Running in non-Node environment (Worker, Browser, etc.)
  }
}

// Format timestamp for folder name: 20251228_143045_123
function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${y}${m}${d}_${h}${min}${s}_${ms}`;
}

// Create log session folder: {sourceFormat}_{targetFormat}_{model}_{timestamp}
async function createLogSession(sourceFormat, targetFormat, model) {
  await ensureNodeModules();
  if (!fs || !LOGS_DIR) return null;
  
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    
    const timestamp = formatTimestamp();
    const safeModel = (model || "unknown").replace(/[/:]/g, "-");
    const folderName = `${sourceFormat}_${targetFormat}_${safeModel}_${timestamp}`;
    const sessionPath = path.join(LOGS_DIR, folderName);
    
    fs.mkdirSync(sessionPath, { recursive: true });
    
    return sessionPath;
  } catch (err) {
    console.log("[LOG] Failed to create log session:", err.message);
    return null;
  }
}

// Write JSON file
function writeJsonFile(sessionPath, filename, data) {
  if (!fs || !sessionPath) return;
  
  try {
    const filePath = path.join(sessionPath, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.log(`[LOG] Failed to write ${filename}:`, err.message);
  }
}

// Mask sensitive header values before writing them to disk. Request-log files
// are plaintext under DATA_DIR; with ENABLE_REQUEST_LOGS they would otherwise
// carry reusable dashboard JWTs, bearer API keys and provider credentials.
// Header NAMES are preserved (useful for debugging); values are redacted.
const SENSITIVE_HEADER_HINTS = [
  "authorization",
  "x-api-key",
  "api-key",
  "apikey",
  "cookie",
  "set-cookie",
  "token",
  "secret",
  "password",
  "credential",
  "session",
];

function maskValue(value) {
  const s = String(value ?? "");
  if (s.length === 0) return "";
  if (s.length <= 12) return "***";
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

export function maskSensitiveHeaders(headers) {
  if (!headers) return {};
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = String(key).toLowerCase();
    if (SENSITIVE_HEADER_HINTS.some((h) => lower.includes(h))) {
      out[key] = maskValue(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// No-op logger when logging is disabled
function createNoOpLogger() {
  return {
    sessionPath: null,
    logClientRawRequest() {},
    logRawRequest() {},
    logOpenAIRequest() {},
    logTargetRequest() {},
    logProviderResponse() {},
    appendProviderChunk() {},
    appendOpenAIChunk() {},
    logConvertedResponse() {},
    appendConvertedChunk() {},
    logError() {}
  };
}

/**
 * Create a new log session and return logger functions
 * @param {string} sourceFormat - Source format from client (claude, openai, etc.)
 * @param {string} targetFormat - Target format to provider (antigravity, gemini-cli, etc.)
 * @param {string} model - Model name
 * @returns {Promise<object>} Promise that resolves to logger object with methods to log each stage
 */
export async function createRequestLogger(sourceFormat, targetFormat, model) {
  // Return no-op logger if logging is disabled
  if (!LOGGING_ENABLED) {
    return createNoOpLogger();
  }

  void pruneLogSessions();
  
  // Wait for session to be created before returning logger
  const sessionPath = await createLogSession(sourceFormat, targetFormat, model);
  
  return {
    get sessionPath() { return sessionPath; },
    
    // 1. Log client raw request (before any conversion)
    logClientRawRequest(endpoint, body, headers = {}) {
      writeJsonFile(sessionPath, "1_req_client.json", {
        timestamp: new Date().toISOString(),
        endpoint,
        headers: maskSensitiveHeaders(headers),
        body
      });
    },
    
    // 2. Log raw request from client (after initial conversion like responsesApi)
    logRawRequest(body, headers = {}) {
      writeJsonFile(sessionPath, "2_req_source.json", {
        timestamp: new Date().toISOString(),
        headers: maskSensitiveHeaders(headers),
        body
      });
    },
    
    // 3. Log OpenAI intermediate format (source → openai)
    logOpenAIRequest(body) {
      writeJsonFile(sessionPath, "3_req_openai.json", {
        timestamp: new Date().toISOString(),
        body
      });
    },
    
    // 4. Log target format request (openai → target)
    logTargetRequest(url, headers, body) {
      writeJsonFile(sessionPath, "4_req_target.json", {
        timestamp: new Date().toISOString(),
        url,
        headers: maskSensitiveHeaders(headers),
        body
      });
    },
    
    // 5. Log provider response (for non-streaming or error)
    logProviderResponse(status, statusText, headers, body) {
      const filename = "5_res_provider.json";
      writeJsonFile(sessionPath, filename, {
        timestamp: new Date().toISOString(),
        status,
        statusText,
        headers: maskSensitiveHeaders(headers ? (typeof headers.entries === "function" ? Object.fromEntries(headers.entries()) : headers) : {}),
        body
      });
    },
    
    // 5. Append streaming chunk to provider response
    appendProviderChunk(chunk) {
      if (!fs || !sessionPath) return;
      queueAppend(path.join(sessionPath, "5_res_provider.txt"), chunk);
    },
    
    // 6. Append OpenAI intermediate chunks (target → openai)
    appendOpenAIChunk(chunk) {
      if (!fs || !sessionPath) return;
      queueAppend(path.join(sessionPath, "6_res_openai.txt"), chunk);
    },
    
    // 7. Log converted response to client (for non-streaming)
    logConvertedResponse(body) {
      writeJsonFile(sessionPath, "7_res_client.json", {
        timestamp: new Date().toISOString(),
        body
      });
    },
    
    // 7. Append streaming chunk to converted response
    appendConvertedChunk(chunk) {
      if (!fs || !sessionPath) return;
      queueAppend(path.join(sessionPath, "7_res_client.txt"), chunk);
    },
    
    // 6. Log error
    logError(error, requestBody = null) {
      writeJsonFile(sessionPath, "6_error.json", {
        timestamp: new Date().toISOString(),
        error: error?.message || String(error),
        stack: error?.stack,
        requestBody
      });
    }
  };
}

// Legacy functions for backward compatibility
export function logRequest() {}
export function logResponse() {}
export function logError(provider, { error, url, model, requestBody }) {
  if (!fs || !LOGS_DIR) return;
  
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    
    const date = new Date().toISOString().split("T")[0];
    const logPath = path.join(LOGS_DIR, `${provider}-${date}.log`);
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: "error",
      provider,
      model,
      url,
      error: error?.message || String(error),
      stack: error?.stack,
      requestBody
    };
    
    queueAppend(logPath, JSON.stringify(logEntry) + "\n");
  } catch (err) {
    console.log("[LOG] Failed to write error log:", err.message);
  }
}
