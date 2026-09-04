import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb.js";
import { recentWebhookEvents, dispatchWebhook } from "@/lib/webhookDispatcher.js";

export const dynamic = "force-dynamic";

// GET /api/webhooks — dispatcher config + recent delivery log
export async function GET() {
  const settings = await getSettings();
  const cfg = typeof settings.webhookDispatcher === "string"
    ? JSON.parse(settings.webhookDispatcher || "{}")
    : settings.webhookDispatcher || {};
  return NextResponse.json({ config: cfg, recent: recentWebhookEvents() });
}

// POST /api/webhooks — set config {url, secret?, events[]} | {test: true}
export async function POST(req) {
  const b = await req.json();
  if (b.test) {
    await dispatchWebhook("test", { message: "KRouter9 webhook test" });
    return NextResponse.json({ ok: true, tested: true });
  }
  if (!b.url) return NextResponse.json({ error: "url required" }, { status: 400 });
  await updateSettings({
    webhookDispatcher: JSON.stringify({
      url: b.url,
      secret: b.secret || "",
      events: b.events || ["account_error", "quota", "credit_low", "fallback"],
    }),
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/webhooks — clear config
export async function DELETE() {
  await updateSettings({ webhookDispatcher: JSON.stringify({ url: "", events: [] }) });
  return NextResponse.json({ ok: true });
}
