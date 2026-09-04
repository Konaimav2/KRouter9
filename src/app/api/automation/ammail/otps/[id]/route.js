import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
async function getDb() { return getAdapter(); }

export const dynamic = "force-dynamic";

// GET /api/automation/ammail/otps/:id — fetch OTP, mark used
export async function GET(req, ctx) {
  const params = await ctx.params;
  try {
    const db = await getDb();
    const otp = db.get("SELECT * FROM ammailOtps WHERE id = ?", [params.id]);
    if (!otp) return NextResponse.json({ error: "OTP not found" }, { status: 404 });
    if (!otp.usedAt) {
      db.run("UPDATE ammailOtps SET usedAt = ? WHERE id = ?", Date.now(), params.id);
      otp.usedAt = Date.now();
    }
    return NextResponse.json({
      ok: true,
      otp: {
        id: otp.id, address: otp.address, alias: otp.alias, domain: otp.domain,
        sender: otp.sender, subject: otp.subject, otp_code: otp.otpCode,
        verify_url: otp.verifyUrl, body_text: otp.bodyText, body_html: otp.bodyHtml,
        received_at: otp.receivedAt, used_at: otp.usedAt,
      },
    });
  } catch (e) { return NextResponse.json({ error: String(e.message || e) }, { status: 500 }); }
}

// POST /api/automation/ammail/otps/:id — { action: "delete" }
export async function POST(req, ctx) {
  const params = await ctx.params;
  try {
    const b = await req.json();
    if (b.action === "delete") {
      getDb().prepare("DELETE FROM ammailOtps WHERE id = ?").run(params.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: String(e.message || e) }, { status: 500 }); }
}
