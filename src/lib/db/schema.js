// ⚠️ AGENT/DEV: Bump this by +1 EVERY TIME you change the schema below
// (add/remove/alter a table, column, or index in TABLES). It drives the
// pre-change safety backup in migrate.js: when the stored version is lower,
// one lightweight DB backup is taken before applying schema changes. Forgetting
// to bump only skips that backup — it does NOT break the additive auto-sync.
export const SCHEMA_VERSION = 4;

export const PRAGMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 30000000;
PRAGMA cache_size = -64000;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
`;

// Declarative current schema. Used by syncSchemaFromTables() to
// auto-add missing tables/columns/indexes after versioned migrations.
// For destructive changes (drop/rename/type-change), write a migration file.
export const TABLES = {
  _meta: {
    columns: {
      key: "TEXT PRIMARY KEY",
      value: "TEXT NOT NULL",
    },
  },
  settings: {
    columns: {
      id: "INTEGER PRIMARY KEY CHECK (id = 1)",
      data: "TEXT NOT NULL",
    },
  },
  providerConnections: {
    columns: {
      id: "TEXT PRIMARY KEY",
      provider: "TEXT NOT NULL",
      authType: "TEXT NOT NULL",
      name: "TEXT",
      email: "TEXT",
      priority: "INTEGER",
      isActive: "INTEGER DEFAULT 1",
      data: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_pc_provider ON providerConnections(provider)",
      "CREATE INDEX IF NOT EXISTS idx_pc_provider_active ON providerConnections(provider, isActive)",
      "CREATE INDEX IF NOT EXISTS idx_pc_priority ON providerConnections(provider, priority)",
    ],
  },
  providerNodes: {
    columns: {
      id: "TEXT PRIMARY KEY",
      type: "TEXT",
      name: "TEXT",
      data: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: ["CREATE INDEX IF NOT EXISTS idx_pn_type ON providerNodes(type)"],
  },
  proxyPools: {
    columns: {
      id: "TEXT PRIMARY KEY",
      isActive: "INTEGER DEFAULT 1",
      testStatus: "TEXT",
      data: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_pp_active ON proxyPools(isActive)",
      "CREATE INDEX IF NOT EXISTS idx_pp_status ON proxyPools(testStatus)",
    ],
  },
  apiKeys: {
    columns: {
      id: "TEXT PRIMARY KEY",
      key: "TEXT UNIQUE NOT NULL",
      name: "TEXT",
      machineId: "TEXT",
      isActive: "INTEGER DEFAULT 1",
      createdAt: "TEXT NOT NULL",
      // KRouter9 credit accounting (ported from srouter)
      rateLimit: "INTEGER DEFAULT 0",
      quotaLimit: "INTEGER DEFAULT 0",
      usageTokens: "INTEGER DEFAULT 0",
      creditLimit: "REAL DEFAULT 0",
      usageCost: "REAL DEFAULT 0",
      // In-flight reservation for atomic credit/quota enforcement (V3).
      // Reserved amount is held between pre-dispatch check and usage reconcile.
      reservedCost: "REAL DEFAULT 0",
      reservedTokens: "INTEGER DEFAULT 0",
      allowedModels: "TEXT",
      // KRouter9 API key manage (0.5.77): per-key RPM/TPM + model allow/deny
      rpmLimit: "INTEGER DEFAULT 0",
      tpmLimit: "INTEGER DEFAULT 0",
      modelPolicy: "TEXT DEFAULT 'off'",
      blockedModels: "TEXT",
    },
    indexes: ["CREATE INDEX IF NOT EXISTS idx_ak_key ON apiKeys(key)"],
  },
  combos: {
    columns: {
      id: "TEXT PRIMARY KEY",
      name: "TEXT UNIQUE NOT NULL",
      kind: "TEXT",
      models: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
      updatedAt: "TEXT NOT NULL",
    },
    indexes: ["CREATE INDEX IF NOT EXISTS idx_combo_name ON combos(name)"],
  },
  kv: {
    columns: {
      scope: "TEXT NOT NULL",
      key: "TEXT NOT NULL",
      value: "TEXT NOT NULL",
    },
    primaryKey: "PRIMARY KEY (scope, key)",
    indexes: ["CREATE INDEX IF NOT EXISTS idx_kv_scope ON kv(scope)"],
  },
  usageHistory: {
    columns: {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      timestamp: "TEXT NOT NULL",
      provider: "TEXT",
      model: "TEXT",
      connectionId: "TEXT",
      apiKey: "TEXT",
      endpoint: "TEXT",
      promptTokens: "INTEGER DEFAULT 0",
      completionTokens: "INTEGER DEFAULT 0",
      cost: "REAL DEFAULT 0",
      status: "TEXT",
      tokens: "TEXT",
      meta: "TEXT",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_uh_ts ON usageHistory(timestamp DESC)",
      "CREATE INDEX IF NOT EXISTS idx_uh_provider ON usageHistory(provider)",
      "CREATE INDEX IF NOT EXISTS idx_uh_model ON usageHistory(model)",
      "CREATE INDEX IF NOT EXISTS idx_uh_conn ON usageHistory(connectionId)",
    ],
  },
  usageDaily: {
    columns: {
      dateKey: "TEXT PRIMARY KEY",
      data: "TEXT NOT NULL",
    },
  },
  requestDetails: {
    columns: {
      id: "TEXT PRIMARY KEY",
      timestamp: "TEXT NOT NULL",
      provider: "TEXT",
      model: "TEXT",
      connectionId: "TEXT",
      status: "TEXT",
      data: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_rd_ts ON requestDetails(timestamp DESC)",
      "CREATE INDEX IF NOT EXISTS idx_rd_provider ON requestDetails(provider)",
      "CREATE INDEX IF NOT EXISTS idx_rd_model ON requestDetails(model)",
      "CREATE INDEX IF NOT EXISTS idx_rd_conn ON requestDetails(connectionId)",
    ],
  },
  // KRouter9 automation tables (ported from 9router-v3)
  codebuddyAccounts: {
    columns: {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      email: "TEXT NOT NULL",
      password: "TEXT NOT NULL",
      profileDir: "TEXT",
      ammailAlias: "TEXT",
      signupMethod: "TEXT DEFAULT 'google'",
      apiKey: "TEXT",
      apiKeyStatus: "TEXT DEFAULT 'pending'",
      lastError: "TEXT",
      lastRunAt: "INTEGER",
      createdAt: "TEXT NOT NULL",
      provider: "TEXT DEFAULT 'codebuddy'",
      canvaEnrolled: "INTEGER DEFAULT 0",
    },
    unique: ["email", "provider"],
    indexes: ["CREATE INDEX IF NOT EXISTS idx_cba_email ON codebuddyAccounts(email)"],
  },
  codebuddyJobs: {
    columns: {
      id: "TEXT PRIMARY KEY",
      type: "TEXT NOT NULL",
      status: "TEXT DEFAULT 'queued'",
      count: "INTEGER DEFAULT 0",
      completed: "INTEGER DEFAULT 0",
      success: "INTEGER DEFAULT 0",
      failed: "INTEGER DEFAULT 0",
      progress: "INTEGER DEFAULT 0",
      resultsJson: "TEXT NOT NULL DEFAULT '[]'",
      createdAt: "TEXT NOT NULL",
      startedAt: "INTEGER",
      finishedAt: "INTEGER",
    },
  },
  ammailOtps: {
    columns: {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      address: "TEXT NOT NULL",
      alias: "TEXT NOT NULL",
      domain: "TEXT",
      sender: "TEXT",
      subject: "TEXT",
      otpCode: "TEXT",
      verifyUrl: "TEXT",
      bodyText: "TEXT",
      bodyHtml: "TEXT",
      messageShortId: "TEXT",
      rawEventJson: "TEXT",
      receivedAt: "INTEGER NOT NULL",
      usedAt: "INTEGER DEFAULT 0",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_ammail_otps_address_received ON ammailOtps(address, receivedAt DESC)",
      "CREATE INDEX IF NOT EXISTS idx_ammail_otps_used ON ammailOtps(usedAt, receivedAt DESC)",
    ],
  },
  // KRouter9 model-level fallback rules (ported from srouter)
  fallbackRules: {
    columns: {
      id: "TEXT PRIMARY KEY",
      sourceModel: "TEXT NOT NULL",
      targetModel: "TEXT NOT NULL",
      priority: "INTEGER NOT NULL DEFAULT 1",
      enabled: "INTEGER NOT NULL DEFAULT 1",
      triggerOnStatus: "TEXT",
      maxRetries: "INTEGER DEFAULT 1",
      createdAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_fallback_rules_priority ON fallbackRules(priority ASC, createdAt ASC)",
    ],
  },
  // KRouter9 semantic cache + prompt templates (OmniRoute concept, minimal)
  semanticCache: {
    columns: {
      key: "TEXT PRIMARY KEY",
      model: "TEXT",
      response: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
    },
  },
  promptTemplates: {
    columns: {
      id: "TEXT PRIMARY KEY",
      name: "TEXT NOT NULL",
      content: "TEXT NOT NULL",
      createdAt: "TEXT NOT NULL",
    },
  },
  // KRouter9 quota pools + token ledger (OmniRoute concept, minimal 3 tables)
  quotaPools: {
    columns: {
      id: "TEXT PRIMARY KEY",
      name: "TEXT NOT NULL",
      description: "TEXT",
      budgetTokens: "INTEGER DEFAULT 0",
      usedTokens: "INTEGER DEFAULT 0",
      createdAt: "TEXT NOT NULL",
    },
  },
  quotaAllocations: {
    columns: {
      id: "TEXT PRIMARY KEY",
      poolId: "TEXT NOT NULL",
      apiKeyId: "TEXT",
      sharePercent: "INTEGER DEFAULT 100",
      createdAt: "TEXT NOT NULL",
    },
  },
  tokenLedger: {
    columns: {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      apiKeyId: "TEXT",
      poolId: "TEXT",
      model: "TEXT",
      tokens: "INTEGER DEFAULT 0",
      cost: "REAL DEFAULT 0",
      createdAt: "TEXT NOT NULL",
    },
    indexes: [
      "CREATE INDEX IF NOT EXISTS idx_ledger_key ON tokenLedger(apiKeyId, createdAt DESC)",
      "CREATE INDEX IF NOT EXISTS idx_ledger_pool ON tokenLedger(poolId, createdAt DESC)",
    ],
  },
};

export function buildCreateTableSql(name, def) {
  const cols = Object.entries(def.columns).map(([k, v]) => `${k} ${v}`);
  if (def.primaryKey) cols.push(def.primaryKey);
  return `CREATE TABLE IF NOT EXISTS ${name} (${cols.join(", ")})`;
}
