import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
async function getDb() { return getAdapter(); }
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/prompts — list templates
export async function GET() {
  const db = await getDb();
  return NextResponse.json({ templates: db.all("SELECT * FROM promptTemplates ORDER BY createdAt DESC", ) });
}

// POST /api/prompts — {name, content}
export async function POST(req) {
  const b = await req.json();
  if (!b.name || !b.content) return NextResponse.json({ error: "name and content required" }, { status: 400 });
  const db = await getDb();
  const t = { id: randomUUID(), name: b.name, content: b.content, createdAt: new Date().toISOString() };
  db.run("INSERT INTO promptTemplates (id, name, content, createdAt) VALUES (?, ?, ?, ?)", [t.id, t.name, t.content, t.createdAt]);
  return NextResponse.json({ template: t }, { status: 201 });
}

// DELETE /api/prompts?id= — delete template
export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  getDb().prepare("DELETE FROM promptTemplates WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
