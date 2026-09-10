#!/usr/bin/env node
// KRouter9 export tool — dump accounts/keys/combos/rules for backup or moving to another KRouter9.
// Usage: node tools/migrations/export.js [outfile.json]

import { writeFileSync } from "node:fs";
import { getAdapter } from "./lib/miniDriver.js";

const outfile = process.argv[2] || "krouter9-export.json";

const db = await getAdapter();
const dump = {
  _meta: { tool: "krouter9-export", exportedAt: new Date().toISOString() },
  providerConnections: db.all("SELECT * FROM providerConnections").map(r => ({ ...r, data: r.data ? JSON.parse(r.data) : {} })),
  apiKeys: db.all("SELECT * FROM apiKeys"),
  combos: db.all("SELECT * FROM combos"),
  fallbackRules: db.all("SELECT * FROM fallbackRules"),
  promptTemplates: db.all("SELECT * FROM promptTemplates"),
  quotaPools: db.all("SELECT * FROM quotaPools"),
  quotaAllocations: db.all("SELECT * FROM quotaAllocations"),
};
writeFileSync(outfile, JSON.stringify(dump, null, 2));
console.log(`exported: ${outfile}`);
console.log(`  connections: ${dump.providerConnections.length}`);
console.log(`  apiKeys: ${dump.apiKeys.length}`);
console.log(`  combos: ${dump.combos.length}`);
console.log(`  fallbackRules: ${dump.fallbackRules.length}`);
console.log(`  promptTemplates: ${dump.promptTemplates.length}`);
console.log(`  quotaPools: ${dump.quotaPools.length}`);
