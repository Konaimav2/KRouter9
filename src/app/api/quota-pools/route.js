import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
async function getDb() { return getAdapter(); }
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/quota-pools — list pools with usage
export async function GET() {
  const db = await getDb();
  const pools = db.all("SELECT * FROM quotaPools ORDER BY createdAt DESC", );
  return NextResponse.json({ pools });
}

// POST /api/quota-pools — {name, description?, budgetTokens?}
export async function POST(req) {
  const b = await req.json();
  if (!b.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const db = await getDb();
  const p = { id: randomUUID(), name: b.name, description: b.description || null, budgetTokens: b.budgetTokens ?? 0, usedTokens: 0, createdAt: new Date().toISOString() };
  db.run("INSERT INTO quotaPools (id, name, description, budgetTokens, usedTokens, createdAt) VALUES (?, ?, ?, ?, ?, ?)", [p.id, p.name, p.description, p.budgetTokens, p.usedTokens, p.createdAt]);
  return NextResponse.json({ pool: p }, { status: 201 });
}
