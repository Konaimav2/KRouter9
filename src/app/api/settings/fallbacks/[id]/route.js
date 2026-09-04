import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
async function getDb() { return getAdapter(); }

export const dynamic = "force-dynamic";

// PUT /api/settings/fallbacks/:id — update rule
export async function PUT(req, ctx) {
  const params = await ctx.params;
  const b = await req.json();
  const db = await getDb();
  const cur = db.get("SELECT * FROM fallbackRules WHERE id = ?", [params.id]);
  if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });
  const next = {
    sourceModel: b.sourceModel ?? cur.sourceModel,
    targetModel: b.targetModel ?? cur.targetModel,
    priority: b.priority ?? cur.priority,
    enabled: b.enabled === undefined ? cur.enabled : (b.enabled ? 1 : 0),
    triggerOnStatus: b.triggerOnStatus === undefined ? cur.triggerOnStatus : (Array.isArray(b.triggerOnStatus) ? JSON.stringify(b.triggerOnStatus) : b.triggerOnStatus),
    maxRetries: b.maxRetries ?? cur.maxRetries,
    id: params.id,
  };
  db.run("UPDATE fallbackRules SET sourceModel=?, targetModel=?, priority=?, enabled=?, triggerOnStatus=?, maxRetries=? WHERE id=?", [next.sourceModel, next.targetModel, next.priority, next.enabled, next.triggerOnStatus, next.maxRetries, next.id]);
  return NextResponse.json({ rule: { ...next, enabled: !!next.enabled } });
}

// DELETE /api/settings/fallbacks/:id
export async function DELETE(req, ctx) {
  const params = await ctx.params;
  const db = await getDb();
  db.run("DELETE FROM fallbackRules WHERE id = ?", [params.id]);
  return NextResponse.json({ ok: true });
}
