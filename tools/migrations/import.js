#!/usr/bin/env node
// KRouter9 migration tool — import accounts/keys/combos/settings from other routers.
// Usage:
//   node tools/migrations/import.js detect <file.json>
//   node tools/migrations/import.js import <file.json> [--dry-run]
//
// Sources (auto-detected by shape):
//   - 9router / ZenRouter / 9router-v3 : exportDb() dump (settings/providerConnections/apiKeys/combos...) or raw ~/.9router/db/data.sqlite tables
//   - srouter   : JSON export { api_keys: [...], fallback_rules: [...], models: [...] }
//   - OmniRoute : JSON export { providerConnections | connections, apiKeys, combos, settings }
//
// What imports:
//   providerConnections (accounts), apiKeys (+ credit fields), combos, fallbackRules,
//   quotaPools, promptTemplates, settings (ammail_*/codebuddy/guardrail keys only).
//
// Idempotent: existing rows (by provider+email / key hash / combo id) are SKIPPED, not duplicated.

import { readFileSync } from "node:fs";
import { getAdapter } from "./lib/miniDriver.js";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const cmd = args[0];
const file = args[1];
const dryRun = args.includes("--dry-run");

function out(obj) { console.log(JSON.stringify(obj, null, 2)); }

function detect(data) {
  if (Array.isArray(data)) data = { providerConnections: data };
  const keys = Object.keys(data);
  if (data.providerConnections && (data.apiKeys || data.settings || keys.length <= 6)) {
    // 9router family export (settings + connections + ...) or OmniRoute
    const conn = data.providerConnections[0] || {};
    if (conn.data !== undefined || conn.provider !== undefined) {
      return "9router-family";
    }
    return "omniroute";
  }
  if (data.connections && (data.apiKeys || data.settings)) return "omniroute";
  if (data.api_keys || data.fallback_rules) return "srouter";
  if (data.accounts && data.jobs) return "9router-v3-automation";
  return "unknown";
}

// providerConnections row → build insert
function mapConnection(r) {
  return {
    id: r.id || randomUUID(),
    provider: r.provider || "unknown",
    authType: r.authType || "oauth",
    name: r.name || r.email || "",
    email: r.email || "",
    priority: r.priority ?? 50,
    isActive: r.isActive === 0 || r.isActive === false ? 0 : 1,
    data: typeof r.data === "string" ? r.data : JSON.stringify(r.data || {}),
    createdAt: r.createdAt || new Date().toISOString(),
    updatedAt: r.updatedAt || new Date().toISOString(),
  };
}

function mapApiKey(r) {
  return {
    id: r.id || randomUUID(),
    key: r.key || r.key_hash || "",
    name: r.name || r.label || "imported",
    machineId: r.machineId || "",
    isActive: r.isActive === 0 || r.isActive === false ? 0 : 1,
    createdAt: r.createdAt || new Date().toISOString(),
    creditLimit: r.creditLimit ?? r.credit_limit ?? null,
    usageCost: r.usageCost ?? r.usage_cost ?? 0,
    usageTokens: r.usageTokens ?? r.usage_tokens ?? 0,
    rateLimit: r.rateLimit ?? r.rate_limit ?? 0,
    quotaLimit: r.quotaLimit ?? r.quota_limit ?? 0,
    allowedModels: r.allowedModels ? (typeof r.allowedModels === "string" ? r.allowedModels : JSON.stringify(r.allowedModels)) : null,
    rpmLimit: r.rpmLimit ?? r.rpm_limit ?? 0,
    tpmLimit: r.tpmLimit ?? r.tpm_limit ?? 0,
    modelPolicy: r.modelPolicy ?? r.model_policy ?? "off",
    blockedModels: r.blockedModels ? (typeof r.blockedModels === "string" ? r.blockedModels : JSON.stringify(r.blockedModels)) : null,
  };
}

function mapFallbackRule(r) {
  return {
    id: r.id || randomUUID(),
    sourceModel: r.sourceModel || r.source_model || "",
    targetModel: r.targetModel || r.target_model || "",
    priority: r.priority ?? 1,
    enabled: r.enabled === false ? 0 : 1,
    triggerOnStatus: JSON.stringify(r.triggerOnStatus || r.trigger_on_status || [429, 403]),
    maxRetries: r.maxRetries ?? r.max_retries ?? 1,
    createdAt: r.createdAt || new Date().toISOString(),
  };
}

async function importAll(data) {
  const db = await getAdapter();
  const summary = { providerConnections: { inserted: 0, skipped: 0 }, apiKeys: { inserted: 0, skipped: 0 }, fallbackRules: { inserted: 0, skipped: 0 }, combos: { inserted: 0, skipped: 0 }, promptTemplates: { inserted: 0, skipped: 0 }, quotaPools: { inserted: 0, skipped: 0 }, settings: { updated: 0 }, kv: { inserted: 0, skipped: 0 }, providerNodes: { inserted: 0, skipped: 0 }, proxyPools: { inserted: 0, skipped: 0 } };

  // Connections
  const conns = data.providerConnections || data.connections || [];
  for (const r of conns) {
    if (!r.provider && !r.email) { summary.providerConnections.skipped++; continue; }
    const c = mapConnection(r);
    // dedupe: same source row already migrated (id), or same provider+email pair
    const exists = db.get("SELECT id FROM providerConnections WHERE id = ? OR (provider = ? AND email = ? AND email != '')",
                          [c.id, c.provider, c.email]);
    if (exists) { summary.providerConnections.skipped++; continue; }
    if (!dryRun) db.run("INSERT INTO providerConnections (id, provider, authType, name, email, priority, isActive, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [c.id, c.provider, c.authType, c.name, c.email, c.priority, c.isActive, c.data, c.createdAt, c.updatedAt]);
    summary.providerConnections.inserted++;
  }

  // API keys
  const keys = data.apiKeys || data.api_keys || [];
  for (const r of keys) {
    if (!r.key && !r.key_hash) { summary.apiKeys.skipped++; continue; }
    const k = mapApiKey(r);
    const exists = db.get("SELECT id FROM apiKeys WHERE key = ?", [k.key]);
    if (exists) { summary.apiKeys.skipped++; continue; }
    if (!dryRun) db.run("INSERT INTO apiKeys (id, key, name, machineId, isActive, createdAt, creditLimit, usageCost, usageTokens, rateLimit, quotaLimit, allowedModels, rpmLimit, tpmLimit, modelPolicy, blockedModels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [k.id, k.key, k.name, k.machineId, k.isActive, k.createdAt, k.creditLimit, k.usageCost, k.usageTokens, k.rateLimit, k.quotaLimit, k.allowedModels, k.rpmLimit, k.tpmLimit, k.modelPolicy, k.blockedModels]);
    summary.apiKeys.inserted++;
  }

  // Fallback rules
  const rules = data.fallbackRules || data.fallback_rules || [];
  for (const r of rules) {
    const rule = mapFallbackRule(r);
    if (!rule.sourceModel || !rule.targetModel) { summary.fallbackRules.skipped++; continue; }
    const exists = db.get("SELECT id FROM fallbackRules WHERE sourceModel = ? AND targetModel = ?", [rule.sourceModel, rule.targetModel]);
    if (exists) { summary.fallbackRules.skipped++; continue; }
    if (!dryRun) db.run("INSERT INTO fallbackRules (id, sourceModel, targetModel, priority, enabled, triggerOnStatus, maxRetries, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [rule.id, rule.sourceModel, rule.targetModel, rule.priority, rule.enabled, rule.triggerOnStatus, rule.maxRetries, rule.createdAt]);
    summary.fallbackRules.inserted++;
  }

  // Combos
  const combos = data.combos || [];
  for (const c of combos) {
    if (!c.id && !c.name) { summary.combos.skipped++; continue; }
    const cid = c.id || randomUUID();
    const exists = db.get("SELECT id FROM combos WHERE id = ?", [cid]);
    if (exists) { summary.combos.skipped++; continue; }
    if (!dryRun) db.run("INSERT INTO combos (id, name, kind, models, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      [cid, c.name || cid, c.kind || null, typeof c.models === "string" ? c.models : JSON.stringify(c.models || []), c.createdAt || new Date().toISOString(), c.updatedAt || new Date().toISOString()]);
    summary.combos.inserted++;
  }

  // Prompt templates
  const templates = data.promptTemplates || data.prompt_templates || [];
  for (const t of templates) {
    if (!t.name || !t.content) { summary.promptTemplates.skipped++; continue; }
    const exists = db.get("SELECT id FROM promptTemplates WHERE name = ?", [t.name]);
    if (exists) { summary.promptTemplates.skipped++; continue; }
    if (!dryRun) db.run("INSERT INTO promptTemplates (id, name, content, createdAt) VALUES (?, ?, ?, ?)",
      [t.id || randomUUID(), t.name, t.content, t.createdAt || new Date().toISOString()]);
    summary.promptTemplates.inserted++;
  }

  // Quota pools
  const pools = data.quotaPools || data.quota_pools || [];
  for (const p of pools) {
    if (!p.name) { summary.quotaPools.skipped++; continue; }
    const exists = db.get("SELECT id FROM quotaPools WHERE name = ?", [p.name]);
    if (exists) { summary.quotaPools.skipped++; continue; }
    if (!dryRun) db.run("INSERT INTO quotaPools (id, name, description, budgetTokens, usedTokens, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
      [p.id || randomUUID(), p.name, p.description || null, p.budgetTokens ?? p.budget_tokens ?? 0, p.usedTokens ?? 0, p.createdAt || new Date().toISOString()]);
    summary.quotaPools.inserted++;
  }

  // Settings — 9router-family: single row {id:1, data:JSON}; merge the whole JSON into the
  // krouter9 settings row (id=1). Carries dashboard password, authMode, toggles — everything.
  // OmniRoute-style dict sources: merge per-key.
  const settings = data.settings || {};
  let merged = {};
  if (Array.isArray(settings) && settings.length && typeof settings[0]?.data === "string") {
    for (const row of settings) {
      try { Object.assign(merged, JSON.parse(row.data)); } catch {}
    }
  } else if (Array.isArray(settings) && settings.length && typeof settings[0]?.data === "object") {
    for (const row of settings) Object.assign(merged, row.data || {});
  } else if (!Array.isArray(settings)) {
    Object.assign(merged, settings);
  }
  const row = db.get("SELECT data FROM settings WHERE id = 1");
  const current = row ? (typeof row.data === "string" ? safeParse(row.data) : row.data) || {} : {};
  for (const [k, v] of Object.entries(merged)) {
    if (!(k in current) || JSON.stringify(current[k]) !== JSON.stringify(v)) {
      current[k] = v;
      summary.settings.updated++;
    }
  }
  if (!dryRun && Object.keys(current).length) {
    db.run("INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      [JSON.stringify(current)]);
  }

  // kv — wholesale (tokens, flags, model intelligence, whatever the source kept there)
  const kvRows = data.kv || [];
  for (const k of kvRows) {
    if (!k.scope || !k.key) { continue; }
    const exists = db.get("SELECT value FROM kv WHERE scope = ? AND key = ?", [k.scope, k.key]);
    if (exists) { summary.kv.skipped++; continue; }
    if (!dryRun) db.run("INSERT INTO kv (scope, key, value) VALUES (?, ?, ?)", [k.scope, k.key, typeof k.value === "string" ? k.value : JSON.stringify(k.value)]);
    summary.kv.inserted++;
  }

  // providerNodes — wholesale
  for (const n of data.providerNodes || []) {
    if (!n.id) { summary.providerNodes.skipped++; continue; }
    const exists = db.get("SELECT id FROM providerNodes WHERE id = ?", [n.id]);
    if (exists) { summary.providerNodes.skipped++; continue; }
    if (!dryRun) db.run("INSERT INTO providerNodes (id, type, name, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      [n.id, n.type || null, n.name || null, typeof n.data === "string" ? n.data : JSON.stringify(n.data || {}),
       n.createdAt || new Date().toISOString(), n.updatedAt || new Date().toISOString()]);
    summary.providerNodes.inserted++;
  }

  // proxyPools — wholesale
  for (const p of data.proxyPools || []) {
    if (!p.id) { summary.proxyPools.skipped++; continue; }
    const exists = db.get("SELECT id FROM proxyPools WHERE id = ?", [p.id]);
    if (exists) { summary.proxyPools.skipped++; continue; }
    if (!dryRun) db.run("INSERT INTO proxyPools (id, isActive, testStatus, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      [p.id, p.isActive === false ? 0 : 1, p.testStatus || null,
       typeof p.data === "string" ? p.data : JSON.stringify(p.data || {}),
       p.createdAt || new Date().toISOString(), p.updatedAt || new Date().toISOString()]);
    summary.proxyPools.inserted++;
  }

  // usageHistory / usageDaily / requestDetails — history wholesale (bounded).
  // These tables carry papi's 40k-row traffic history; migrate copies them in
  // arrival order so both the Logs tab and Request Details tab survive the move.
  // Cap requestDetails (largest blobs) to keep the export/import bounded.
  summary.usageHistory = { inserted: 0, skipped: 0 };
  summary.usageDaily = { inserted: 0, skipped: 0 };
  summary.requestDetails = { inserted: 0, skipped: 0 };
  for (const e of data.usageHistory || []) {
    const dup = db.get(
      `SELECT id FROM usageHistory WHERE timestamp = ? AND COALESCE(provider,'') = COALESCE(?, '') AND COALESCE(model,'') = COALESCE(?, '') AND COALESCE(connectionId,'') = COALESCE(?, '') AND COALESCE(apiKey,'') = COALESCE(?, '') AND promptTokens = ? AND completionTokens = ? LIMIT 1`,
      [e.timestamp || null, e.provider || null, e.model || null, e.connectionId || null, e.apiKey || null, e.promptTokens || 0, e.completionTokens || 0]);
    if (dup) { summary.usageHistory.skipped++; continue; }
    if (!dryRun) db.run(
      `INSERT INTO usageHistory(timestamp, provider, model, connectionId, apiKey, endpoint, promptTokens, completionTokens, cost, status, tokens, meta) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.timestamp || new Date().toISOString(), e.provider || null, e.model || null, e.connectionId || null, e.apiKey || null, e.endpoint || null,
       e.promptTokens || 0, e.completionTokens || 0, e.cost || 0, e.status || "ok",
       typeof e.tokens === "string" ? e.tokens : JSON.stringify(e.tokens || {}),
       typeof e.meta === "string" ? e.meta : JSON.stringify(e.meta || {})]);
    summary.usageHistory.inserted++;
  }
  for (const d of data.usageDaily || []) {
    if (!d.dateKey) { summary.usageDaily.skipped++; continue; }
    const exists = db.get("SELECT dateKey FROM usageDaily WHERE dateKey = ?", [d.dateKey]);
    if (exists) { summary.usageDaily.skipped++; continue; }
    if (!dryRun) db.run("INSERT INTO usageDaily(dateKey, data) VALUES(?, ?)",
      [d.dateKey, typeof d.data === "string" ? d.data : JSON.stringify(d.data || {})]);
    summary.usageDaily.inserted++;
  }
  const details = (data.requestDetails || []).slice(-2000);
  for (const r of details) {
    if (!r.id) { summary.requestDetails.skipped++; continue; }
    const exists = db.get("SELECT id FROM requestDetails WHERE id = ?", [r.id]);
    if (exists) { summary.requestDetails.skipped++; continue; }
    const rowData = r.data !== undefined ? (typeof r.data === "string" ? r.data : JSON.stringify(r.data)) : JSON.stringify(r);
    if (!dryRun) db.run("INSERT INTO requestDetails(id, timestamp, provider, model, connectionId, status, data) VALUES(?, ?, ?, ?, ?, ?, ?)",
      [r.id, r.timestamp || new Date().toISOString(), r.provider || null, r.model || null, r.connectionId || null, r.status || null, rowData]);
    summary.requestDetails.inserted++;
  }

  return summary;
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }

async function main() {
  if (!cmd || !file) {
    out({ usage: "node tools/migrations/import.js detect|import <file.json> [--dry-run]" });
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(file, "utf8"));
  const source = detect(data);
  if (cmd === "detect") {
    out({ source, shapes: Object.keys(data) });
    return;
  }
  if (cmd === "import") {
    const summary = await importAll(data);
    out({ source, dryRun, summary });
    return;
  }
  out({ error: `unknown command: ${cmd}` });
  process.exit(1);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
