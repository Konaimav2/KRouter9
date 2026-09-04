import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
async function getDb() { return getAdapter(); }
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/settings/fallbacks — list all model-level fallback rules
export async function GET() {
  const db = await getDb();
  const rows = db.all("SELECT * FROM fallbackRules ORDER BY priority ASC, createdAt ASC", );
  return NextResponse.json({ rules: rows.map(r => ({ ...r, enabled: !!r.enabled })) });
}

// POST /api/settings/fallbacks — create rule {sourceModel, targetModel, priority?, enabled?, triggerOnStatus? (array), maxRetries?}
export async function POST(req) {
  const b = await req.json();
  if (!b.sourceModel || !b.targetModel) {
    return NextResponse.json({ error: "sourceModel and targetModel required" }, { status: 400 });
  }
  const db = await getDb();
  const rule = {
    id: randomUUID(),
    sourceModel: b.sourceModel,
    targetModel: b.targetModel,
    priority: b.priority ?? 1,
    enabled: b.enabled === false ? 0 : 1,
    triggerOnStatus: Array.isArray(b.triggerOnStatus) ? JSON.stringify(b.triggerOnStatus) : (b.triggerOnStatus || null),
    maxRetries: b.maxRetries ?? 1,
    createdAt: new Date().toISOString(),
  };
  db.run("INSERT INTO fallbackRules (id, sourceModel, targetModel, priority, enabled, triggerOnStatus, maxRetries, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [rule.id, rule.sourceModel, rule.targetModel, rule.priority, rule.enabled, rule.triggerOnStatus, rule.maxRetries, rule.createdAt]);
  return NextResponse.json({ rule: { ...rule, enabled: !!rule.enabled } }, { status: 201 });
}
