// Migration registry — append new entries when schema changes.
// Each migration: { version: number, name: string, up(db): void }
// Versions MUST be unique and monotonically increasing, and MUST stay above
// every historically-stamped schemaVersion (baseline = SCHEMA_VERSION in
// ../schema.js; see 001-initial.js) or old DBs will skip them forever.
import m001 from "./001-initial.js";
import m002 from "./002-clear-per-key-user-agent.js";

export const MIGRATIONS = [m001, m002].sort((a, b) => a.version - b.version);

export function latestVersion() {
  return MIGRATIONS.length ? MIGRATIONS[MIGRATIONS.length - 1].version : 0;
}
