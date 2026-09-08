#!/usr/bin/env node
// Minimal SQLite adapter for the migration tools (no app deps).
// Node >= 22.5: node:sqlite (built-in). Older: sql.js if resolvable.
// DB file: $KROUTER9_DATA_DIR/db/data.sqlite, else ~/.krouter9/db/data.sqlite.
// If the DB does not exist, it is CREATED with the full KRouter9 schema —
// `krouter9 migrate` bootstraps a fresh install without starting the server first.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TABLES, buildCreateTableSql } from "./schema.js";

function dataFile() {
  const dir = process.env.KROUTER9_DATA_DIR || path.join(os.homedir(), ".krouter9");
  return path.join(dir, "db", "data.sqlite");
}

function createSchema(db) {
  for (const [name, def] of Object.entries(TABLES)) {
    db.exec(buildCreateTableSql(name, def));
    for (const idx of def.indexes || []) db.exec(idx);
    if (def.unique) {
      const uq = `CREATE UNIQUE INDEX IF NOT EXISTS idx_${name}_${def.unique.join("_")} ON ${name}(${def.unique.join(", ")})`;
      try { db.exec(uq); } catch {}
    }
  }
}

async function openNodeSqlite(file) {
  const maj = Number(process.versions.node.split(".")[0]);
  const min = Number(process.versions.node.split(".")[1] || 0);
  if (maj < 22 || (maj === 22 && min < 5)) return null;
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  const stmtCache = new Map();
  const prepare = (sql) => {
    let s = stmtCache.get(sql);
    if (!s) { s = db.prepare(sql); stmtCache.set(sql, s); }
    return s;
  };
  return {
    driver: "node:sqlite",
    run(sql, params = []) {
      const r = prepare(sql).run(...params);
      return { changes: Number(r.changes ?? 0), lastInsertRowid: Number(r.lastInsertRowid ?? 0) };
    },
    get(sql, params = []) { return prepare(sql).get(...params); },
    all(sql, params = []) { return prepare(sql).all(...params); },
    exec(sql) { return db.exec(sql); },
  };
}

async function openSqlJs(file) {
  let SQL;
  try { SQL = (await import("sql.js")).default; }
  catch { return null; }
  const initSqlJs = SQL;
  const sqljs = await initSqlJs();
  const db = fs.existsSync(file) ? new sqljs.Database(fs.readFileSync(file)) : new sqljs.Database();
  const persist = () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(db.export())); };
  return {
    driver: "sql.js",
    run(sql, params = []) { db.run(sql, params); persist(); return { changes: db.getRowsModified(), lastInsertRowid: 0 }; },
    get(sql, params = []) { const st = db.prepare(sql); st.bind(params); const row = st.step() ? st.getAsObject() : undefined; st.free(); return row; },
    all(sql, params = []) { const st = db.prepare(sql); st.bind(params); const rows = []; while (st.step()) rows.push(st.getAsObject()); st.free(); return rows; },
    exec(sql) { return db.exec(sql); },
  };
}

export async function getAdapter() {
  const file = dataFile();
  const existed = fs.existsSync(file);
  if (!existed) {
    // Bootstrap: create parent dirs + empty file, then let the schema creation below fill it in.
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "");
    console.log(`[migrate] No KRouter9 database found — created fresh schema at ${file}`);
  }
  const adapter = (await openNodeSqlite(file)) || (await openSqlJs(file));
  if (!adapter) throw new Error("[migrate] No SQLite driver available (need Node >= 22.5 or the sql.js package)");
  if (!existed) createSchema(adapter);
  console.log(`[migrate] Driver: ${adapter.driver} | file: ${file}`);
  return adapter;
}
