// U1/U2: User-Agent is provider-level only. Strip orphaned per-key
// `providerSpecificData.userAgent` values left over from the old per-key UA
// fields so every key inherits the node/provider-level value at runtime.
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

export default {
  // Version 5: above every historically-stamped schemaVersion (≤4) so this
  // migration actually runs on old DBs. See 001-initial.js baseline note.
  version: 5,
  name: "clear-orphaned-per-key-user-agent",
  up(db) {
    let rows = [];
    try {
      rows = db.all(`SELECT id, data FROM providerConnections`);
    } catch {
      return;
    }
    for (const row of rows) {
      const data = parseJson(row?.data, null);
      if (!data || typeof data !== "object") continue;
      const psd = data.providerSpecificData;
      if (!psd || typeof psd !== "object" || Array.isArray(psd)) continue;
      if (!Object.prototype.hasOwnProperty.call(psd, "userAgent")) continue;
      const next = { ...psd };
      delete next.userAgent;
      const nextData = { ...data, providerSpecificData: next };
      try {
        db.run(`UPDATE providerConnections SET data = ? WHERE id = ?`, [stringifyJson(nextData), row.id]);
      } catch {
        // best effort per row — one bad row must not abort the migration
      }
    }
  },
};
