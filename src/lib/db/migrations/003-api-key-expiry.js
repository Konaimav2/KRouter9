// Nullable expiry keeps pre-existing gateway keys non-expiring.
export default {
  version: 6,
  name: "api-key-expiry",
  up(db) {
    const columns = db.all("PRAGMA table_info(apiKeys)");
    // Fresh databases are created by the declarative schema after migrations.
    if (columns.length && !columns.some(column => column.name === "expiresAt")) {
      db.exec("ALTER TABLE apiKeys ADD COLUMN expiresAt TEXT");
    }
  },
};
