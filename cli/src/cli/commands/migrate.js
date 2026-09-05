#!/usr/bin/env node

// krouter9 migrate — one-command migration from another router (SRouter-style:
// built into the CLI, no separate node script to run).
//
// Usage:
//   krouter9 migrate                  # interactive: detect, preview, import
//   krouter9 migrate --file <export>  # import a JSON export explicitly
//   krouter9 migrate --sqlite <path>  # dump a foreign SQLite then import
//   krouter9 migrate --dry-run        # preview only
//
// The heavy lifting (source detection, idempotent row import) lives in the
// server repo under tools/migrations/import.js — this command shells into the
// SAME code so CLI and docs never drift apart.

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

function resolveRepoRoot() {
  // CLI layout: <repo>/cli/src/cli/commands/migrate.js (dev) or the packaged
  // CLI ships app/ — in packaged mode the migrations tools ride along in cli/.
  const candidates = [
    path.join(__dirname, "..", "..", "..", ".."), // dev: repo root
    path.join(__dirname, "..", "..", ".."),       // packaged: cli/ parent
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "tools", "migrations", "import.js"))) return c;
  }
  return null;
}

function findForeignSqlite() {
  const candidates = [
    path.join(os.homedir(), ".9router", "db", "data.sqlite"), // 9router / 9router-v3
    path.join(os.homedir(), ".zenrouter", "db", "data.sqlite"), // ZenRouter
    path.join(os.homedir(), ".srouter", "db", "data.sqlite"), // SRouter
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function run(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") args.file = argv[++i];
    else if (argv[i] === "--sqlite") args.sqlite = argv[++i];
    else if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
  }

  if (args.help) {
    console.log(`krouter9 migrate — import accounts, keys, combos, and settings from another router

Usage:
  krouter9 migrate                       detect + preview + import (interactive)
  krouter9 migrate --file <export.json>  import a JSON export
  krouter9 migrate --sqlite <db.sqlite>  dump a foreign SQLite then import
  krouter9 migrate --dry-run             preview what would move, change nothing

Sources supported: 9router, ZenRouter, 9router-v3, SRouter, OmniRoute.
The import is idempotent — re-running skips rows that already exist.`);
    return 0;
  }

  const repoRoot = resolveRepoRoot();
  if (!repoRoot) {
    console.error("❌ Migration tools not found next to the CLI. Run from a repo checkout.");
    return 1;
  }

  // Resolve the import entry: source tree or packaged standalone.
  const importJs = path.join(repoRoot, "tools", "migrations", "import.js");
  if (!fs.existsSync(importJs)) {
    console.error("❌ tools/migrations/import.js missing in", repoRoot);
    return 1;
  }

  // Step 1: figure out the export file.
  let exportFile = args.file || null;
  if (!exportFile && args.sqlite) {
    console.log(`📦 Dumping SQLite: ${args.sqlite}`);
    const dump = spawnSync(process.execPath, [path.join(repoRoot, "tools", "migrations", "sqlite-dump.js"), args.sqlite], {
      stdio: "inherit",
    });
    if (dump.status !== 0) return dump.status || 1;
    exportFile = findDumpedExport(args.sqlite);
  }
  if (!exportFile) {
    const foreign = findForeignSqlite();
    if (foreign) {
      console.log(`🔎 Found a foreign router database: ${foreign}`);
      console.log(`📦 Dumping...`);
      const dump = spawnSync(process.execPath, [path.join(repoRoot, "tools", "migrations", "sqlite-dump.js"), foreign], {
        stdio: "inherit",
      });
      if (dump.status !== 0) return dump.status || 1;
      exportFile = findDumpedExport(foreign);
    }
  }
  if (!exportFile) {
    console.error("❌ No source found. Pass one explicitly:");
    console.error("   krouter9 migrate --sqlite ~/.9router/db/data.sqlite");
    console.error("   krouter9 migrate --file ~/db-export.json");
    return 1;
  }

  // Step 2: detect.
  console.log(`\n🔍 Detecting source format: ${exportFile}`);
  const detect = spawnSync(process.execPath, [importJs, "detect", exportFile], { stdio: "inherit" });
  if (detect.status !== 0) return detect.status || 1;

  // Step 3: dry-run preview, then real import (unless --dry-run).
  const dry = spawnSync(process.execPath, [importJs, "import", exportFile, "--dry-run"], { stdio: "inherit" });
  if (dry.status !== 0) return dry.status || 1;

  if (args.dryRun) {
    console.log("\nDry run only — nothing was imported. Re-run without --dry-run to import.");
    return 0;
  }

  const imp = spawnSync(process.execPath, [importJs, "import", exportFile], { stdio: "inherit" });
  if (imp.status !== 0) return imp.status || 1;

  console.log("\n✅ Migration complete. Start krouter9 and check the dashboard.");
  return 0;
}

function findDumpedExport(sqlitePath) {
  // sqlite-dump.js writes <basename-without-ext>-export.json next to the DB.
  const dir = path.dirname(sqlitePath);
  const base = path.basename(sqlitePath).replace(/\.sqlite(-wal|-shm)?$/i, "");
  const candidate = path.join(dir, `${base}-export.json`);
  return fs.existsSync(candidate) ? candidate : null;
}

module.exports = { run };
