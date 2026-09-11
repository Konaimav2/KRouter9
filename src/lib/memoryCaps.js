// P3: memory-cap resolution. Values are configurable via Settings
// (settingsRepo DEFAULT_SETTINGS, env-overridable). Env var name is the
// camelCase key converted to SCREAMING_SNAKE_CASE.

const FALLBACK = {
  observabilityBodyCapBytes: 262144,
  observabilityBufferBytes: 8 * 1024 * 1024,
  streamAccumulateCapBytes: 65536,
  circuitBreakerTtlMs: 30 * 60 * 1000,
  circuitBreakerMaxEntries: 5000,
  antigravityCacheTtlMs: 10 * 60 * 1000,
  antigravityCacheMaxEntries: 5000,
  rateLimitMapCap: 10000,
};

function camelToEnv(name) {
  return String(name).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

export function memoryCap(name) {
  const v = Number(process.env?.[camelToEnv(name)]);
  if (Number.isFinite(v) && v > 0) return Math.floor(v);
  const fb = FALLBACK[name];
  return fb !== undefined ? fb : undefined;
}

/** Read the cap from a settings object when provided, else env/fallback. */
export function memoryCapFrom(settings, name) {
  const v = Number(settings?.[name]);
  if (Number.isFinite(v) && v > 0) return Math.floor(v);
  return memoryCap(name);
}
