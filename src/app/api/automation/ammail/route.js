import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
async function getDb() { return getAdapter(); }
import { getSettings, updateSettings } from "@/lib/localDb.js";
import { getAmmailClientFromSettings } from "@/lib/automation/ammailClient.js";

export const dynamic = "force-dynamic";

// GET /api/automation/ammail — status + inboxes + recent OTPs (ported from 9router-v3)
export async function GET() {
  try {
    const settings = await getSettings();
    const client = await getAmmailClientFromSettings();
    const db = await getDb();
    const otps = db.all("SELECT * FROM ammailOtps ORDER BY receivedAt DESC LIMIT 50", );

    let configured = client.configured;
    let connectionOk = false;
    let connectionError = "";
    let domains = [];
    let inboxes = [];
    if (configured) {
      try {
        const info = await client.info();
        domains = info.domains || [];
        connectionOk = true;
      } catch (e) { connectionError = String(e.message || e); }
    }
    return NextResponse.json({
      configured, connection_ok: connectionOk, connection_error: connectionError,
      domains, inboxes,
      settings: {
        base_url: settings.ammail_base_url || "",
        api_key: settings.ammail_api_key || "",
        default_domain: settings.ammail_default_domain || "",
        webhook_secret: settings.ammail_webhook_secret || "",
      },
      otps: otps.map(o => ({
        id: o.id, address: o.address, alias: o.alias, sender: o.sender,
        subject: o.subject, otp_code: o.otpCode, verify_url: o.verifyUrl,
        received_at: o.receivedAt, used_at: o.usedAt,
      })),
    });
  } catch (e) { return NextResponse.json({ error: String(e.message || e) }, { status: 500 }); }
}

// POST /api/automation/ammail — { action: list-domains | settings | test-connection | inbox-create | inbox-delete | otps-delete-bulk }
export async function POST(req) {
  try {
    const body = await req.json();
    const { action } = body;
    const settings = await getSettings();
    const client = await getAmmailClientFromSettings();

    if (action === "list-domains") {
      let domains = [];
      if (client.configured) {
        try { domains = (await client.info()).domains || []; } catch {}
      }
      if (!domains.length && settings.ammail_default_domain) domains = [settings.ammail_default_domain];
      return NextResponse.json({ domains });
    }
    if (action === "settings") {
      const allowed = ["ammail_base_url", "ammail_api_key", "ammail_default_domain", "ammail_webhook_secret"];
      const patch = {};
      for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];
      await updateSettings(patch);
      return NextResponse.json({ ok: true });
    }
    if (action === "test-connection") {
      try {
        const info = await client.info();
        return NextResponse.json({ ok: true, info });
      } catch (e) { return NextResponse.json({ ok: false, error: String(e.message || e) }); }
    }
    if (action === "inbox-create") {
      const inbox = await client.createInbox(body.alias || undefined);
      return NextResponse.json({ ok: true, inbox });
    }
    if (action === "inbox-delete") {
      await client.deleteInbox(body.alias || body.address);
      return NextResponse.json({ ok: true });
    }
    if (action === "otps-delete-bulk") {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length) getDb().prepare(`DELETE FROM ammailOtps WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
      return NextResponse.json({ ok: true, deleted: ids.length });
    }
    // auto-deploy / webhook-register / webhook-test need CF worker env — not ported (see docs)
    return NextResponse.json({ error: `Unknown or unported action: ${action}` }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: String(e.message || e) }, { status: 500 }); }
}
