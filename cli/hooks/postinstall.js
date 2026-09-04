#!/usr/bin/env node

// Postinstall: warm-up SQLite deps into ~/.krouter9/runtime so the first
// `krouter9` start doesn't need network. Failure here is non-fatal —
// cli.js will retry at runtime if anything is missing.
const { ensureSqliteRuntime } = require("./sqliteRuntime");
const { ensureTrayRuntime } = require("./trayRuntime");

try {
  ensureSqliteRuntime({ silent: false });
  console.log("[krouter9] runtime SQLite deps ready");
} catch (e) {
  console.warn(`[krouter9] runtime warm-up skipped: ${e.message}`);
}

try {
  ensureTrayRuntime({ silent: false });
} catch (e) {
  console.warn(`[krouter9] tray runtime skipped: ${e.message}`);
}

process.exit(0);
