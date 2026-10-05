// RW-Seed — production-shaped QA fixtures for the DEV database.
//
// Seeder takes DATA_DIR env (defaults to the dev DATA_DIR passed at runtime)
// and writes papi-shaped rows. CREATE ONLY under tests/fixtures/; NEVER
// touches src. No commits.
//
// Usage:
//   DATA_DIR=/path/to/dev-data node tests/fixtures/seed-qa-data.mjs
//   DATA_DIR=/path/to/dev-data node tests/fixtures/seed-qa-data.mjs --clean
//
// Design:
//   - Direct SQLite access via node:sqlite (Node >= 22.5; falls back to
//     better-sqlite3, then sql.js). Replicates the DDL in src/lib/db/schema.js
//     instead of importing src/* (the `@/...` alias is Next-only and must not
//     be pulled into this standalone script). Shapes match the *_TO_ROW
//     conventions in connectionsRepo / migrate.js exactly (SCREAMING columns,
//     JSON `data` blob for the rest).
//   - Every row the seeder creates carries a "qa-seed" marker so --clean can
//     delete ONLY seeded rows and leave user data untouched:
//       providerConnections.email = "qa-seed+<n>@example.com"
//         (email is nullable/display-only; marker does not affect routing)
//       apiKeys.name = "[QA-SEED] <name>"
//       usageHistory.meta = JSON {"qaSeed": true} (stringifyJson({}) par in repo)
//       requestDetails data-blob carries qaSeed: true alongside repo fields
//       usageDaily rows are NOT deleted on clean (they aggregate mixed data;
//         instead the seeder rewrites only the last-7-days buckets it owns via
//         upsert, and --clean leaves daily aggregates in place — listed below).
//
// QUOTA-STORE DISCOVERY (for the return report):
//   There is NO persistent quota-cache table. The quota UI (ProviderLimits)
//   fetches LIVE per-account quota via GET /api/usage/[connectionId] ->
//   getUsageForProvider() (open-sse/services/usage.js) on every mount
//   ("Always fetch fresh quota on mount, no cache display"), keeps the result
//   in React state, and mirrors it to window.localStorage["quotaCacheData"]
//   (client-side only, for cross-navigation display). Sort/pagination
//   server-side reads come from GET /api/providers/client, which re-fetches
//   live snapshots per connection (45s in-memory TTL) — also no DB table.
//   Consequence: quota reset-timestamp mix CANNOT be seeded via the DB. The
//   seeder instead persists per-connection `quotaSnapshot` payloads into the
//   connection `data` JSON blob (same shape getUsageForProvider returns, so a
//   QA harness can stub fetch or read the blob), AND the ProviderLimits sort
//   helpers (sortVisibleConnections, getConnectionQuotaRemaining) operate on
//   exactly that shape. No-quota accounts are seeded as connections whose
//   snapshot is `{ message: <reason> }` (mirrors handlers' fail-open shape).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const SEED_TAG = "qa-seed";
const SEED_EMAIL = (n) => `qa-seed+${n}@example.com`;
const SEED_KEY_NAME = (n) => `[QA-SEED] ${n}`;

const args = new Set(process.argv.slice(2));
const DO_CLEAN = args.has("--clean");

// DATA_DIR resolution mirrors src/lib/dataDir.js (minus the Windows guard,
// which does not apply to this Linux QA box).
function resolveDataDir() {
  const configured = process.env.DATA_DIR;
  if (configured) {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  }
  return path.join(os.homedir(), ".krouter9");
}

const DATA_DIR = resolveDataDir();
const DB_DIR = path.join(DATA_DIR, "db");
const DATA_FILE = path.join(DB_DIR, "data.sqlite");
fs.mkdirSync(DB_DIR, { recursive: true });

// ─── Minimal sync-SQLite opener (node:sqlite → better-sqlite3 → sql.js) ────
async function openDb(file) {
  try {
    const sqlite = await import("node:sqlite");
    const db = new sqlite.DatabaseSync(file);
    db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`);
    return {
      driver: "node:sqlite",
      run: (sql, p = []) => { const r = db.prepare(sql).run(...p); return { changes: Number(r.changes ?? 0) }; },
      get: (sql, p = []) => db.prepare(sql).get(...p),
      all: (sql, p = []) => db.prepare(sql).all(...p),
      exec: (sql) => db.exec(sql),
      close: () => { try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch {} try { db.close(); } catch {} },
    };
  } catch {}
  try {
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(file);
    db.pragma("journal_mode = WAL");
    return {
      driver: "better-sqlite3",
      run: (sql, p = []) => { const r = db.prepare(sql).run(...p); return { changes: Number(r.changes ?? 0) }; },
      get: (sql, p = []) => db.prepare(sql).get(...p),
      all: (sql, p = []) => db.prepare(sql).all(...p),
      exec: (sql) => db.exec(sql),
      close: () => { try { db.close(); } catch {} },
    };
  } catch {}
  throw new Error("No sync SQLite driver available (need Node >= 22.5 for node:sqlite, or better-sqlite3 installed)");
}

const J = (v) => JSON.stringify(v ?? null);

// ─── Schema (additive, mirrors src/lib/db/schema.js TABLES) ────────────────
// CREATE TABLE IF NOT EXISTS only — never migrates or alters user data.
const DDL = [
  `CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS providerConnections (id TEXT PRIMARY KEY, provider TEXT NOT NULL, authType TEXT NOT NULL, name TEXT, email TEXT, priority INTEGER, isActive INTEGER DEFAULT 1, data TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_pc_provider ON providerConnections(provider)`,
  `CREATE TABLE IF NOT EXISTS providerNodes (id TEXT PRIMARY KEY, type TEXT, name TEXT, data TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS apiKeys (id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, name TEXT, machineId TEXT, isActive INTEGER DEFAULT 1, createdAt TEXT NOT NULL, rateLimit INTEGER DEFAULT 0, quotaLimit INTEGER DEFAULT 0, usageTokens INTEGER DEFAULT 0, creditLimit REAL DEFAULT 0, usageCost REAL DEFAULT 0, reservedCost REAL DEFAULT 0, reservedTokens INTEGER DEFAULT 0, allowedModels TEXT, rpmLimit INTEGER DEFAULT 0, tpmLimit INTEGER DEFAULT 0, modelPolicy TEXT DEFAULT 'off', blockedModels TEXT)`,
  `CREATE TABLE IF NOT EXISTS usageHistory (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, provider TEXT, model TEXT, connectionId TEXT, apiKey TEXT, endpoint TEXT, promptTokens INTEGER DEFAULT 0, completionTokens INTEGER DEFAULT 0, cost REAL DEFAULT 0, status TEXT, tokens TEXT, meta TEXT)`,
  `CREATE TABLE IF NOT EXISTS usageDaily (dateKey TEXT PRIMARY KEY, data TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS requestDetails (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, provider TEXT, model TEXT, connectionId TEXT, status TEXT, data TEXT NOT NULL)`,
];

// ─── Fixture plan ──────────────────────────────────────────────────────────
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const H = 3_600_000;
const D = 86_400_000;

// 12 connections: antigravity x5, codex x3, tokenharbor x2, custom x2.
// Custom connections ride on two providerNodes with distinct prefixes
// (openai-compatible-chat-<id> convention from provider-nodes route).
const NODES = [
  { id: "openai-compatible-chat-qa-seed-1", type: "openai-compatible", name: "QA Seed OC Node A", prefix: "qaoc-a", apiType: "chat", baseUrl: "https://qa-seed-a.example.com/v1" },
  { id: "openai-compatible-chat-qa-seed-2", type: "openai-compatible", name: "QA Seed OC Node B", prefix: "qaoc-b", apiType: "chat", baseUrl: "https://qa-seed-b.example.com/v1" },
];

function connRow({ id, provider, authType, name, emailN, priority, extra }) {
  const ts = iso(now - 30 * D);
  return [
    id, provider, authType, name, SEED_EMAIL(emailN), priority, 1,
    J({ testStatus: "active", ...(extra || {}) }), ts, iso(now - D),
  ];
}

// Staggered priorities per provider (1..n, plus one NULL-priority row to
// exercise the COALESCE(priority,999) ordering in getProviderConnections).
const CONNECTIONS = [
  // antigravity x5 (oauth)
  { id: "qa-seed-ag-1", provider: "antigravity", authType: "oauth", name: "QA Seed AG One", emailN: "ag1", priority: 1, extra: { providerSpecificData: { projectId: "qa-seed-proj-1" } } },
  { id: "qa-seed-ag-2", provider: "antigravity", authType: "oauth", name: "QA Seed AG Two", emailN: "ag2", priority: 2, extra: { providerSpecificData: { projectId: "qa-seed-proj-2" } } },
  { id: "qa-seed-ag-3", provider: "antigravity", authType: "oauth", name: "QA Seed AG Three", emailN: "ag3", priority: 3, extra: {} },
  { id: "qa-seed-ag-4", provider: "antigravity", authType: "oauth", name: "QA Seed AG Four", emailN: "ag4", priority: 4, extra: {} },
  { id: "qa-seed-ag-5", provider: "antigravity", authType: "oauth", name: "QA Seed AG Five", emailN: "ag5", priority: null, extra: {} },
  // codex x3 (oauth, chatgptAccountId distinguishes multi-grant same-email)
  { id: "qa-seed-cx-1", provider: "codex", authType: "oauth", name: "QA Seed CX One", emailN: "cx1", priority: 1, extra: { providerSpecificData: { chatgptAccountId: "qa-seed-ws-1" } } },
  { id: "qa-seed-cx-2", provider: "codex", authType: "oauth", name: "QA Seed CX Two", emailN: "cx2", priority: 2, extra: { providerSpecificData: { chatgptAccountId: "qa-seed-ws-2" } } },
  { id: "qa-seed-cx-3", provider: "codex", authType: "oauth", name: "QA Seed CX Three", emailN: "cx3", priority: 3, extra: { providerSpecificData: { chatgptAccountId: "qa-seed-ws-3" } } },
  // tokenharbor x2 (apikey)
  { id: "qa-seed-th-1", provider: "tokenharbor", authType: "apikey", name: "QA Seed TH One", emailN: "th1", priority: 1, extra: { apiKey: "qa-seed-only-marker-not-a-key" } },
  { id: "qa-seed-th-2", provider: "tokenharbor", authType: "apikey", name: "QA Seed TH Two", emailN: "th2", priority: 2, extra: { apiKey: "qa-seed-only-marker-not-a-key" } },
  // custom openai-compatible x2 with distinct prefixes (distinct provider ids)
  { id: "qa-seed-oc-1", provider: "openai-compatible-chat-qa-seed-1", authType: "apikey", name: "QA Seed OC-A One", emailN: "oc1", priority: 1, extra: { providerSpecificData: { prefix: "qaoc-a", apiType: "chat", baseUrl: "https://qa-seed-a.example.com/v1", nodeName: "QA Seed OC Node A" } } },
  { id: "qa-seed-oc-2", provider: "openai-compatible-chat-qa-seed-2", authType: "apikey", name: "QA Seed OC-B One", emailN: "oc2", priority: 1, extra: { providerSpecificData: { prefix: "qaoc-b", apiType: "chat", baseUrl: "https://qa-seed-b.example.com/v1", nodeName: "QA Seed OC Node B" } } },
];

// Per-connection quota snapshots in getUsageForProvider shape, persisted into
// the connection `data` blob under `quotaSnapshot` (see header note on why a
// DB quota-cache table does not exist). Reset mix: hours / days / none, plus
// two no-quota accounts ({ message } fail-open shape).
function quotaSnapshotFor(connId) {
  const inH = (h) => iso(now + h * H);
  const inD = (d) => iso(now + d * D);
  switch (connId) {
    case "qa-seed-ag-1": return { plan: "Pro", quotas: { "gemini-3.8-flash-high": { used: 200, total: 1000, resetAt: inH(3), remainingPercentage: 80, unlimited: false, displayName: "Gemini 3.8 Flash" } } };
    case "qa-seed-ag-2": return { plan: "Pro", quotas: { "gemini-3.8-flash-high": { used: 900, total: 1000, resetAt: inD(2), remainingPercentage: 10, unlimited: false, displayName: "Gemini 3.8 Flash" }, "claude-sonnet-4-6": { used: 100, total: 1000, resetAt: inD(6), remainingPercentage: 90, unlimited: false, displayName: "Claude Sonnet" } } };
    case "qa-seed-ag-3": return { plan: "Free", quotas: { "gemini-3.8-flash-high": { used: 1000, total: 1000, resetAt: inH(9), remainingPercentage: 0, unlimited: false, displayName: "Gemini 3.8 Flash" } } };
    case "qa-seed-ag-4": return { plan: "Pro", quotas: { "claude-sonnet-4-6": { used: 50, total: 1000, resetAt: null, remainingPercentage: 95, unlimited: false, displayName: "Claude Sonnet" } } };
    case "qa-seed-ag-5": return { message: "QA seed: no quota returned for this account (fail-open shape)" };
    case "qa-seed-cx-1": return { plan: "Plus", quotas: { session: { used: 20, total: 100, remaining: 80, resetAt: inH(5) }, weekly: { used: 40, total: 100, remaining: 60, resetAt: inD(4) } } };
    case "qa-seed-cx-2": return { plan: "Plus", quotas: { session: { used: 95, total: 100, remaining: 5, resetAt: inH(1) }, weekly: { used: 90, total: 100, remaining: 10, resetAt: inD(1) } } };
    case "qa-seed-cx-3": return { message: "Codex connected. Usage API temporarily unavailable (503)." };
    case "qa-seed-th-1": return { message: "Usage not available for this connection" };
    case "qa-seed-th-2": return { message: "Usage not available for this connection" };
    case "qa-seed-oc-1": return { message: "Usage not available for this connection" };
    case "qa-seed-oc-2": return { message: "Usage not available for this connection" };
    default: return { message: "QA seed: unknown connection" };
  }
}

// 3 models, DIVERGENT tokens-vs-cost order (sort/mode mixups observable):
//   model-tokens-leader: most tokens (50_000) but cheapest ($0.50)
//   model-cost-leader:   fewest tokens (4_000) but priciest ($9.00)
//   model-middle:        middle of both (20_000 tokens, $3.00)
// Spread over the last 7 days + one row per model with NULL tokens JSON and
// flat promptTokens/completionTokens columns (fail-open aggregation path).
const MODELS = [
  { model: "qa-seed-tokens-leader", provider: "antigravity", conn: "qa-seed-ag-1", perDay: { prompt: 6000, completion: 1000, cost: 0.05 }, days: 7, nullTokensRow: { prompt: 1000, completion: 200, cost: 0.15 } },
  { model: "qa-seed-cost-leader", provider: "codex", conn: "qa-seed-cx-1", perDay: { prompt: 400, completion: 100, cost: 1.2 }, days: 7, nullTokensRow: { prompt: 300, completion: 100, cost: 0.6 } },
  { model: "qa-seed-middle", provider: "tokenharbor", conn: "qa-seed-th-1", perDay: { prompt: 2000, completion: 500, cost: 0.35 }, days: 7, nullTokensRow: { prompt: 1200, completion: 300, cost: 0.55 } },
];

// 3 API keys: 2 with usage, 1 unused. Shape mirrors apiKeysRepo.createApiKey
// (sk-<machineId>-<keyId>-<crc8> via the same HMAC construction).
const API_KEY_SECRET = process.env.API_KEY_SECRET || "endpoint-proxy-api-key-secret";
function genKey(machineId) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let keyId = "";
  for (let i = 0; i < 6; i++) keyId += chars.charAt(Math.floor(Math.random() * chars.length));
  const crc = crypto.createHmac("sha256", API_KEY_SECRET).update(machineId + keyId).digest("hex").slice(0, 8);
  return { key: `sk-${machineId}-${keyId}-${crc}`, machineId };
}
const SEED_KEYS = [
  { id: "qa-seed-key-1", name: SEED_KEY_NAME("dashboard"), machine: "qaseedmachine0001", withUsage: true },
  { id: "qa-seed-key-2", name: SEED_KEY_NAME("cli"), machine: "qaseedmachine0002", withUsage: true },
  { id: "qa-seed-key-3", name: SEED_KEY_NAME("unused"), machine: "qaseedmachine0003", withUsage: false },
];

function dateKeyLocal(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  const db = await openDb(DATA_FILE);
  console.log(`[qa-seed] driver=${db.driver} file=${DATA_FILE}`);

  if (DO_CLEAN) {
    const c1 = db.run(`DELETE FROM providerConnections WHERE email LIKE 'qa-seed+%@example.com'`).changes;
    const c2 = db.run(`DELETE FROM providerNodes WHERE id LIKE 'openai-compatible-chat-qa-seed-%'`).changes;
    const c3 = db.run(`DELETE FROM apiKeys WHERE name LIKE '[QA-SEED]%'`).changes;
    // usageHistory rows tagged via meta JSON {"qaSeed":true}
    const tagged = db.all(`SELECT id, meta FROM usageHistory WHERE meta IS NOT NULL AND meta LIKE '%qaSeed%'`);
    let c4 = 0;
    for (const r of tagged) {
      try { if (JSON.parse(r.meta)?.qaSeed === true) c4 += db.run(`DELETE FROM usageHistory WHERE id = ?`, [r.id]).changes; } catch {}
    }
    const rd = db.all(`SELECT id, data FROM requestDetails`);
    let c5 = 0;
    for (const r of rd) {
      try { if (JSON.parse(r.data)?.qaSeed === true) c5 += db.run(`DELETE FROM requestDetails WHERE id = ?`, [r.id]).changes; } catch {}
    }
    console.log(JSON.stringify({ cleaned: { connections: c1, nodes: c2, apiKeys: c3, usageHistory: c4, requestDetails: c5 }, note: "usageDaily aggregates left in place (mixed data); re-seed overwrites the last-7-day buckets it owns" }));
    db.close();
    return;
  }

  for (const sql of DDL) db.exec(sql);

  // 1. Nodes (custom providers ride on these)
  const ts = iso(now - 30 * D);
  for (const n of NODES) {
    const { id, type, name, ...rest } = n;
    db.run(
      `INSERT INTO providerNodes(id, type, name, data, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET type=excluded.type, name=excluded.name, data=excluded.data, updatedAt=excluded.updatedAt`,
      [id, type, name, J(rest), ts, iso(now - D)]
    );
  }

  // 2. Connections (12) with quotaSnapshot in the data blob
  for (const c of CONNECTIONS) {
    const row = connRow(c);
    // connRow layout: [id, provider, authType, name, email, priority,
    //   isActive, data, createdAt, updatedAt] — data blob is index 7.
    const blob = JSON.parse(row[7]);
    blob.quotaSnapshot = quotaSnapshotFor(c.id);
    row[7] = J(blob);
    db.run(
      `INSERT INTO providerConnections(id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, authType=excluded.authType, name=excluded.name,
         email=excluded.email, priority=excluded.priority, isActive=excluded.isActive, data=excluded.data, updatedAt=excluded.updatedAt`,
      row
    );
  }

  // 3. API keys (3)
  const keyValues = {};
  for (const k of SEED_KEYS) {
    const { key, machineId } = genKey(k.machine);
    keyValues[k.id] = key;
    db.run(
      `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES(?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET key=excluded.key, name=excluded.name, machineId=excluded.machineId`,
      [k.id, key, k.name, machineId, 1, iso(now - 20 * D)]
    );
  }

  // 4. usageHistory: 7 daily rows per model + 1 NULL-tokens flat-column row.
  // usageDaily: rebuild the last-7-day buckets the seeder owns via the same
  // aggregation convention as usageRepo.aggregateEntryToDay.
  const dayAgg = new Map(); // dateKey -> day object
  function dayFor(ms) {
    const dk = dateKeyLocal(ms);
    if (!dayAgg.has(dk)) dayAgg.set(dk, { requests: 0, promptTokens: 0, completionTokens: 0, cost: 0, byProvider: {}, byModel: {}, byAccount: {}, byApiKey: {}, byEndpoint: {} });
    return dayAgg.get(dk);
  }
  function bump(counter, k, vals, meta) {
    counter[k] ||= { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0 };
    counter[k].requests += 1;
    counter[k].promptTokens += vals.prompt || 0;
    counter[k].completionTokens += vals.completion || 0;
    counter[k].cost += vals.cost || 0;
    if (meta) Object.assign(counter[k], meta);
  }
  function recordUsage({ ms, provider, model, conn, apiKey, endpoint, prompt, completion, cost, tokensNull }) {
    const tokens = tokensNull ? null : { prompt_tokens: prompt, completion_tokens: completion };
    db.run(
      `INSERT INTO usageHistory(timestamp, provider, model, connectionId, apiKey, endpoint, promptTokens, completionTokens, cost, status, tokens, meta)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [iso(ms), provider, model, conn, apiKey, endpoint || "/v1/chat/completions", prompt, completion, cost, "ok", tokens ? J(tokens) : null, J({ qaSeed: true })]
    );
    const day = dayFor(ms);
    day.requests += 1; day.promptTokens += prompt; day.completionTokens += completion; day.cost += cost;
    const vals = { prompt, completion, cost };
    bump(day.byProvider, provider, vals);
    bump(day.byModel, `${model}|${provider}`, vals, { rawModel: model, provider });
    bump(day.byAccount, conn, vals, { rawModel: model, provider });
    const ak = apiKey || "local-no-key";
    bump(day.byApiKey, `${ak}|${model}|${provider}`, vals, { rawModel: model, provider, apiKey });
    bump(day.byEndpoint, `${endpoint || "Unknown"}|${model}|${provider}`, vals, { endpoint: endpoint || "Unknown", rawModel: model, provider });
    // Mirror the credit-accounting side effect of saveRequestUsage for keys 1-2
    if (apiKey && keyValues["qa-seed-key-1"] !== undefined && (apiKey === keyValues["qa-seed-key-1"] || apiKey === keyValues["qa-seed-key-2"])) {
      db.run(`UPDATE apiKeys SET usageCost = MAX(0, COALESCE(usageCost,0) + ?), usageTokens = MAX(0, COALESCE(usageTokens,0) + ?) WHERE key = ?`, [cost, prompt + completion, apiKey]);
    }
  }

  const key1 = keyValues["qa-seed-key-1"];
  const key2 = keyValues["qa-seed-key-2"];
  let usageRows = 0;
  for (const m of MODELS) {
    const apiKey = m.provider === "antigravity" ? key1 : m.provider === "codex" ? key2 : key1;
    for (let d = m.days; d >= 1; d--) {
      const ms = now - d * D + H; // yesterday..7d ago, mid-morning UTC
      recordUsage({ ms, provider: m.provider, model: m.model, conn: m.conn, apiKey, prompt: m.perDay.prompt, completion: m.perDay.completion, cost: m.perDay.cost });
      usageRows++;
    }
    // NULL-tokens flat-column row (2h ago, counts toward "today"/24h views too)
    recordUsage({ ms: now - 2 * H, provider: m.provider, model: m.model, conn: m.conn, apiKey, prompt: m.nullTokensRow.prompt, completion: m.nullTokensRow.completion, cost: m.nullTokensRow.cost, tokensNull: true });
    usageRows++;
  }
  // Deterministic error row (status 429) for the tokens-leader model
  db.run(
    `INSERT INTO usageHistory(timestamp, provider, model, connectionId, apiKey, endpoint, promptTokens, completionTokens, cost, status, tokens, meta)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [iso(now - 30 * 60_000), "antigravity", "qa-seed-tokens-leader", "qa-seed-ag-3", key1, "/v1/chat/completions", 0, 0, 0, "error:429", J({}), J({ qaSeed: true })]
  );
  usageRows++;

  for (const [dateKey, day] of dayAgg) {
    db.run(`INSERT INTO usageDaily(dateKey, data) VALUES(?, ?) ON CONFLICT(dateKey) DO UPDATE SET data = excluded.data`, [dateKey, J(day)]);
  }

  // 5. requestDetails rows incl. error rows with credential-shaped excerpts.
  // Blob mirrors requestDetailsRepo.saveRequestDetail fields (id, timestamp,
  // provider, model, connectionId, status, latency, tokens, apiKeyMasked,
  // keyName, request, providerRequest, providerResponse, response, cost) plus
  // qaSeed:true tag. Raw keys NEVER stored — only masked identity.
  const mask = (k) => (k.length <= 8 ? k.charAt(0) + "***" : k.slice(0, 8) + "***");
  const details = [
    { id: `qa-seed-rd-ok-1`, ms: now - 5 * H, provider: "antigravity", model: "qa-seed-tokens-leader", conn: "qa-seed-ag-1", status: "ok", key: key1, keyName: SEED_KEY_NAME("dashboard"), prompt: 6000, completion: 1000, cost: 0.05, response: { status: 200, body: "ok" } },
    { id: `qa-seed-rd-ok-2`, ms: now - 4 * H, provider: "codex", model: "qa-seed-cost-leader", conn: "qa-seed-cx-1", status: "ok", key: key2, keyName: SEED_KEY_NAME("cli"), prompt: 400, completion: 100, cost: 1.2, response: { status: 200, body: "ok" } },
    { id: `qa-seed-rd-err-429`, ms: now - 3 * H, provider: "antigravity", model: "qa-seed-tokens-leader", conn: "qa-seed-ag-3", status: "error:429", key: key1, keyName: SEED_KEY_NAME("dashboard"), prompt: 0, completion: 0, cost: 0, response: { status: 429, error: "upstream 429 rate limited for key sk-qaseedm-abcdef12 for account qa-seed+ag3@example.com" } },
    { id: `qa-seed-rd-err-401`, ms: now - 2 * H, provider: "codex", model: "qa-seed-cost-leader", conn: "qa-seed-cx-2", status: "error:401", key: key2, keyName: SEED_KEY_NAME("cli"), prompt: 0, completion: 0, cost: 0, response: { status: 401, error: "invalid access_token=ya29.qaSeedInvalidAccessToken123 for client" } },
    { id: `qa-seed-rd-err-500`, ms: now - 1 * H, provider: "tokenharbor", model: "qa-seed-middle", conn: "qa-seed-th-1", status: "error:500", key: key1, keyName: SEED_KEY_NAME("dashboard"), prompt: 0, completion: 0, cost: 0, response: { status: 500, error: "Authorization: Bearer tkhb-qaSeedBearerToken999 failed at https://tokenharbor.ai/v1/chat/completions" } },
  ];
  for (const d of details) {
    const blob = {
      id: d.id, provider: d.provider, model: d.model, connectionId: d.conn, timestamp: iso(d.ms), status: d.status,
      latency: { totalMs: 120 }, tokens: { prompt_tokens: d.prompt, completion_tokens: d.completion },
      apiKeyMasked: mask(d.key), keyName: d.keyName,
      request: { _truncated: true, _originalSize: 9999, _preview: '{"messages":[...] seeded preview}' },
      providerRequest: { model: d.model },
      providerResponse: { status: d.response.status, error: d.response.error || undefined, body: d.response.body || undefined },
      response: d.response,
      cost: d.cost,
      qaSeed: true,
    };
    db.run(
      `INSERT INTO requestDetails(id, timestamp, provider, model, connectionId, status, data) VALUES(?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET timestamp=excluded.timestamp, provider=excluded.provider, model=excluded.model, connectionId=excluded.connectionId, status=excluded.status, data=excluded.data`,
      [d.id, iso(d.ms), d.provider, d.model, d.conn, d.status, J(blob)]
    );
  }

  // Counts
  const counts = {
    connections: db.get(`SELECT COUNT(*) AS n FROM providerConnections WHERE email LIKE 'qa-seed+%@example.com'`)?.n ?? 0,
    nodes: db.get(`SELECT COUNT(*) AS n FROM providerNodes WHERE id LIKE 'openai-compatible-chat-qa-seed-%'`)?.n ?? 0,
    apiKeys: db.get(`SELECT COUNT(*) AS n FROM apiKeys WHERE name LIKE '[QA-SEED]%'`)?.n ?? 0,
    quotaSnapshots: db.all(`SELECT data FROM providerConnections WHERE email LIKE 'qa-seed+%@example.com'`).filter((r) => { try { return !!JSON.parse(r.data)?.quotaSnapshot; } catch { return false; } }).length,
    usageHistorySeedRows: usageRows,
    usageModels: db.all(`SELECT DISTINCT model FROM usageHistory WHERE model LIKE 'qa-seed-%'`).map((r) => r.model),
    requestDetails: db.get(`SELECT COUNT(*) AS n FROM requestDetails WHERE id LIKE 'qa-seed-rd-%'`)?.n ?? 0,
    usageDailyBuckets: dayAgg.size,
  };
  console.log(JSON.stringify({ seeded: counts, dataDir: DATA_DIR }, null, 2));
  db.close();
}

main().catch((e) => { console.error(`[qa-seed] FATAL: ${e.message}`); process.exit(1); });
