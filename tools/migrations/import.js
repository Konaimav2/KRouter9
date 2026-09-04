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
import { getAdapter } from "../../src/lib/db/driver.js";
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
  const summary = { providerConnections: { inserted: 0, skipped: 0 }, apiKeys: { inserted: 0, skipped: 0 }, fallbackRules: { inserted: 0, skipped: 0 }, combos: { inserted: 0, skipped: 0 }, promptTemplates: { inserted: 0, skipped: 0 }, quotaPools: { inserted: 0, skipped: 0 }, settings: { updated: 0 } };

  // Connections
  const conns = data.providerConnections || data.connections || [];
  for (const r of conns) {
    if (!r.provider && !r.email) { summary.providerConnections.skipped++; continue; }
    const c = mapConnection(r);
    const exists = db.get("SELECT id FROM providerConnections WHERE provider = ? AND email = ? AND email != ''", [c.provider, c.email]);
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
    if (!dryRun) db.run("INSERT INTO apiKeys (id, key, name, machineId, isActive, createdAt, creditLimit, usageCost, usageTokens, rateLimit, quotaLimit, allowedModels) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [k.id, k.key, k.name, k.machineId, k.isActive, k.createdAt, k.creditLimit, k.usageCost, k.usageTokens, k.rateLimit, k.quotaLimit, k.allowedModels]);
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

  // Settings — only KRouter9-specific keys
  const settings = data.settings || {};
  const ALLOWED_SETTINGS = /^(ammail_|codebuddy_|guardrail|quotaAware|fallbackRules|reasoningRouting|semanticCache)/;
  const setRows = Object.entries(settings).filter(([k]) => ALLOWED_SETTINGS.test(k));
  for (const [k, v] of setRows) {
    if (!dryRun) {
      db.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [k, typeof v === "string" ? v : JSON.stringify(v)]);
    }
    summary.settings.updated++;
  }

  return summary;
}

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
