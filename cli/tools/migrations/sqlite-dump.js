#!/usr/bin/env node
// SQLite-to-JSON bridge: pull tables directly from another router's SQLite DB
// (9router / ZenRouter / 9router-v3 use ~/.9router/db/data.sqlite or similar).
// Usage: node tools/migrations/sqlite-dump.js <path/to/data.sqlite> [outfile.json]
//
// Uses node:sqlite (Node ≥22.5) — read-only. Never opens the file in write mode.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const dbPath = process.argv[2];
const outfile = process.argv[3] || dbPath.replace(/\.sqlite$/, "") + "-export.json";

if (!dbPath || !existsSync(dbPath)) {
  console.error("usage: node tools/migrations/sqlite-dump.js <data.sqlite> [outfile.json]");
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const dump = { _meta: { tool: "krouter9-sqlite-dump", from: dbPath, exportedAt: new Date().toISOString() } };

// Discover tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
console.log("tables:", tables.join(", "));

for (const t of tables) {
  try {
    dump[t] = db.prepare(`SELECT * FROM "${t}"`).all();
  } catch (e) {
    console.warn(`skip ${t}: ${e.message}`);
  }
}

writeFileSync(outfile, JSON.stringify(dump, null, 2));
const counts = Object.entries(dump).filter(([k]) => k !== "_meta").map(([k, v]) => `${k}: ${v.length}`);
console.log("exported:", outfile);
console.log(counts.join("\n"));
