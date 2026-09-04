// Circuit breaker ported from srouter (seaavey/SRouter, MIT).

const DEFAULT_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 5 * 60_000;

const RATE_LIMIT_OR_QUOTA_PATTERNS = [
    /rate\s*limit/i,
    /too\s+many\s+requests/i,
    /quota\s*(exceeded|exhausted|limit)/i,
    /resource\s*exhausted/i,
    /capacity/i,
    /high\s+traffic/i,
    /temporarily\s+unavailable/i
];

function isRateLimitOrQuotaError(error) {
    if (!error) return false;
    const msg = error instanceof Error ? error.message : String(error);
    return RATE_LIMIT_OR_QUOTA_PATTERNS.some((p) => p.test(msg));
}

export class CircuitBreaker {
    constructor(defaultCooldownMs = DEFAULT_COOLDOWN_MS) {
        this.healthMap = new Map();
        this.defaultCooldownMs = defaultCooldownMs;
    }

    getHealth(providerId) {
        let health = this.healthMap.get(providerId);
        if (!health) {
            health = {
                providerId,
                state: "healthy",
                consecutiveFailures: 0
            };
            this.healthMap.set(providerId, health);
        }

        // Auto-recover if cooldown period has elapsed
        if (health.cooldownUntil && Date.now() >= health.cooldownUntil) {
            health.state = "healthy";
            health.cooldownUntil = undefined;
        }

        return health;
    }

    isAvailable(providerId) {
        const health = this.getHealth(providerId);
        return health.state === "healthy";
    }

    recordSuccess(providerId) {
        const health = this.getHealth(providerId);
        health.state = "healthy";
        health.consecutiveFailures = 0;
        health.lastSuccessTime = Date.now();
        health.cooldownUntil = undefined;
        health.lastErrorMessage = undefined;
    }

    recordFailure(providerId, error, retryAfterMs) {
        const health = this.getHealth(providerId);
        const now = Date.now();
        health.consecutiveFailures += 1;
        health.lastFailureTime = now;
        health.lastErrorMessage = error instanceof Error ? error.message : String(error);

        let cooldownDuration = retryAfterMs;
        if (cooldownDuration === undefined || cooldownDuration <= 0) {
            // Exponential backoff based on consecutive failures
            const multiplier = Math.min(Math.pow(2, health.consecutiveFailures - 1), 10);
            cooldownDuration = Math.min(this.defaultCooldownMs * multiplier, MAX_COOLDOWN_MS);
        }

        health.state = isRateLimitOrQuotaError(error)
            ? "cooldown"
            : health.consecutiveFailures >= 5
              ? "exhausted"
              : "cooldown";
        health.cooldownUntil = now + cooldownDuration;
    }

    reset(providerId) {
        if (providerId) {
            this.healthMap.delete(providerId);
        } else {
            this.healthMap.clear();
        }
    }

    /**
     * Filters candidate providers by health, prioritizing healthy ones.
     * If all candidates are in cooldown, returns candidate with nearest cooldown expiration.
     */
    sortCandidatesByHealth(candidates) {
        if (candidates.length <= 1) return candidates;

        const now = Date.now();
        const available = [];
        const inCooldown = [];

        for (const candidate of candidates) {
            const health = this.getHealth(candidate.id);
            if (health.state === "healthy") {
                available.push(candidate);
            } else {
                const remainingMs = Math.max(0, (health.cooldownUntil ?? now) - now);
                inCooldown.push({ candidate, remainingMs });
            }
        }

        if (available.length > 0) {
            return available;
        }

        // All candidates are in cooldown: sort by shortest remaining wait time
        inCooldown.sort((a, b) => a.remainingMs - b.remainingMs);
        return inCooldown.map((item) => item.candidate);
    }
}

export const circuitBreaker = new CircuitBreaker();
