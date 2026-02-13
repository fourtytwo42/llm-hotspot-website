const buckets = new Map();

function nowMs() {
  return Date.now();
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function getProxyRateLimitConfig() {
  return {
    windowMs: parsePositiveInt(process.env.PROXY_RATE_LIMIT_WINDOW_MS, 60_000),
    max: parsePositiveInt(process.env.PROXY_RATE_LIMIT_MAX, 120),
  };
}

export function checkRateLimit(key, { windowMs, max }) {
  const now = nowMs();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return {
      allowed: true,
      remaining: Math.max(max - 1, 0),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (bucket.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: Math.max(max - bucket.count, 0),
    retryAfterSeconds: Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1),
  };
}

