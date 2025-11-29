
const store = new Map();
const DEFAULT_RPM = parseInt(process.env.RATE_LIMIT_RPM || "60", 10);

export function rateLimit(ip, rpm = DEFAULT_RPM) {
  const now = Date.now();
  const windowMs = 60_000;
  const bucket = store.get(ip) || { tokens: rpm, last: now };
  const elapsed = now - bucket.last;
  // refill
  const refill = (elapsed / windowMs) * rpm;
  bucket.tokens = Math.min(rpm, bucket.tokens + refill);
  bucket.last = now;
  if (bucket.tokens < 1) {
    store.set(ip, bucket);
    return { ok: false, remaining: 0 };
  }
  bucket.tokens -= 1;
  store.set(ip, bucket);
  return { ok: true, remaining: Math.floor(bucket.tokens) };
}
