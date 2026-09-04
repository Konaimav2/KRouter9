// KRouter9 webhook dispatcher — notify external endpoints on router events
// (account failure, quota exhausted, key credit low, fallback triggered).
// Events fire async, never block chat. Fail-open.
// Config: settings.webhookDispatcher = { url, secret, events: ["account_error","quota","credit_low","fallback"] }
import { getAdapter } from "@/lib/db/driver.js";
import { getSettings } from "@/lib/localDb.js";

const _ring = [];
function log(ev, detail) {
  _ring.push({ ts: Date.now(), ev, detail });
  if (_ring.length > 100) _ring.shift();
}

export function recentWebhookEvents() { return _ring.slice(-50); }

export async function dispatchWebhook(event, payload = {}) {
  try {
    const settings = await getSettings();
    const cfg = typeof settings.webhookDispatcher === "string"
      ? JSON.parse(settings.webhookDispatcher)
      : settings.webhookDispatcher;
    if (!cfg?.url || !Array.isArray(cfg.events) || !cfg.events.includes(event)) return;
    const body = JSON.stringify({ event, payload, ts: new Date().toISOString(), source: "krouter9" });
    const headers = { "Content-Type": "application/json" };
    if (cfg.secret) headers["X-KRouter9-Signature"] = cfg.secret;
    // fire-and-forget with timeout
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    fetch(cfg.url, { method: "POST", headers, body, signal: ac.signal })
      .then(() => log(event, { ok: true }))
      .catch((e) => log(event, { ok: false, error: e.message }))
      .finally(() => clearTimeout(timer));
  } catch { /* fail-open */ }
}

// Convenience emitters used by chat.js
export async function notifyAccountError(provider, email, status, message) {
  await dispatchWebhook("account_error", { provider, email, status, message });
}
export async function notifyFallback(fromModel, toModel, reason) {
  await dispatchWebhook("fallback", { fromModel, toModel, reason });
}
export async function notifyCreditLow(keyName, remaining, threshold = 1) {
  if (remaining !== null && remaining <= threshold) {
    await dispatchWebhook("credit_low", { keyName, remaining });
  }
}
export async function notifyQuota(provider, model) {
  await dispatchWebhook("quota", { provider, model });
}
