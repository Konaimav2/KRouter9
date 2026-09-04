import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
async function getDb() { return getAdapter(); }

export const dynamic = "force-dynamic";

// GET /api/keys/:id/credit — balance {creditLimit, usageCost, remaining, usageTokens, quotaLimit}
export async function GET(req, ctx) {
  const params = await ctx.params;
  const db = await getDb();
  const row = db.get("SELECT id, name, creditLimit, usageCost, usageTokens, quotaLimit, rateLimit FROM apiKeys WHERE id = ?", [params.id]);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const remaining = (row.creditLimit || 0) > 0 ? Math.max(0, row.creditLimit - (row.usageCost || 0)) : null;
  return NextResponse.json({ ...row, remaining });
}

// POST /api/keys/:id/credit — {amount} adds credit (negative = deduct). Also supports {rateLimit, quotaLimit, allowedModels}.
export async function POST(req, ctx) {
  const params = await ctx.params;
  const b = await req.json();
  const db = await getDb();
  const cur = db.get("SELECT * FROM apiKeys WHERE id = ?", [params.id]);
  if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (typeof b.amount === "number") {
    db.run("UPDATE apiKeys SET creditLimit = COALESCE(creditLimit,0) + ? WHERE id = ?", [b.amount, params.id]);
  }
  if (b.rateLimit !== undefined) db.run("UPDATE apiKeys SET rateLimit = ? WHERE id = ?", [b.rateLimit, params.id]);
  if (b.quotaLimit !== undefined) db.run("UPDATE apiKeys SET quotaLimit = ? WHERE id = ?", [b.quotaLimit, params.id]);
  if (b.allowedModels !== undefined) db.run("UPDATE apiKeys SET allowedModels = ? WHERE id = ?", [Array.isArray(b.allowedModels) ? JSON.stringify(b.allowedModels) : b.allowedModels, params.id]);
  const row = db.get("SELECT id, name, creditLimit, usageCost, usageTokens, quotaLimit, rateLimit FROM apiKeys WHERE id = ?", [params.id]);
  return NextResponse.json({ ...row, remaining: (row.creditLimit || 0) > 0 ? Math.max(0, row.creditLimit - (row.usageCost || 0)) : null });
}
