// Audit log for sensitive dashboard actions (proxy reveal, etc.).
// Append-only JSON-lines file under DATA_DIR + in-memory ring for inspection.
// Never pass secrets here — metadata only (ids, provider, ip, result).
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./dataDir.js";

const MAX_BYTES = 2 * 1024 * 1024;
const RING_CAP = 200;
const ring = [];

function auditFile() {
  return path.join(DATA_DIR, "audit.log");
}

export async function appendAuditEvent(type, details = {}) {
  const entry = { ts: new Date().toISOString(), type, ...details };
  if (ring.length >= RING_CAP) ring.shift();
  ring.push(entry);
  try {
    const file = auditFile();
    try {
      const st = fs.statSync(file);
      if (st.size > MAX_BYTES) {
        try {
          fs.renameSync(file, `${file}.1`);
        } catch {
          /* ignore rotation failure */
        }
      }
    } catch {
      /* file does not exist yet */
    }
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
  } catch (e) {
    console.log("[audit] append failed:", e?.message || e);
  }
  try {
    console.log(`[audit] ${type}`, JSON.stringify(details));
  } catch {
    /* ignore stringify failure */
  }
  return entry;
}

export function getRecentAuditEvents() {
  return [...ring];
}

export function resetAuditEvents() {
  ring.length = 0;
}
