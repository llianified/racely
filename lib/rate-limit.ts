import "server-only";

/**
 * In-process token bucket. Racely runs as a single PM2 fork instance on one EC2 box,
 * so a shared map is enough to stop a Mini App client from spamming balance-changing
 * actions. Move this to Redis first if the deployment ever scales beyond one process.
 */
export type RateLimitRule = {
  /** Burst size: how many requests can be spent back to back. */
  capacity: number;
  /** Steady-state refill rate. */
  refillPerSecond: number;
};

export const GAME_ACTION_RULE: RateLimitRule = {
  capacity: 20,
  refillPerSecond: 2,
};

type Bucket = { tokens: number; updatedAt: number };

const IDLE_TTL_MS = 10 * 60 * 1000;
const MAX_BUCKETS = 10_000;

const globalForRateLimit = globalThis as unknown as {
  racelyRateBuckets?: Map<string, Bucket>;
};
const buckets = (globalForRateLimit.racelyRateBuckets ??= new Map<
  string,
  Bucket
>());

export function resetRateLimits() {
  buckets.clear();
}

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.updatedAt <= IDLE_TTL_MS) break;
    buckets.delete(key);
  }
  while (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next();
    if (oldest.done) break;
    buckets.delete(oldest.value);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  /** Whole seconds a rejected caller should wait before retrying. */
  retryAfterSeconds: number;
  remaining: number;
};

export function consumeRateLimit(
  key: string,
  rule: RateLimitRule = GAME_ACTION_RULE,
  now = Date.now(),
): RateLimitResult {
  sweep(now);

  const bucket = buckets.get(key);
  const tokens = bucket
    ? Math.min(
        rule.capacity,
        bucket.tokens + ((now - bucket.updatedAt) / 1000) * rule.refillPerSecond,
      )
    : rule.capacity;

  if (tokens < 1) {
    buckets.set(key, { tokens, updatedAt: now });
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((1 - tokens) / rule.refillPerSecond),
      ),
      remaining: 0,
    };
  }

  const remaining = tokens - 1;
  // Re-inserting keeps the map ordered by last use so sweep() can stop at the first fresh entry.
  buckets.delete(key);
  buckets.set(key, { tokens: remaining, updatedAt: now });
  return { allowed: true, retryAfterSeconds: 0, remaining };
}
