'use strict';
// Process-local fallback limiter. For multi-instance deployments, use a shared store (e.g. Redis).
const buckets = new Map();
const WINDOW_MS = 60_000;
const MAX_KEYS = 20_000;
let lastSweep = 0;
function rateLimitV22({ windowMs = WINDOW_MS, max = 120, key = req => req.ip || 'unknown' } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    if (now - lastSweep > 60_000 || buckets.size > MAX_KEYS) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
      if (buckets.size > MAX_KEYS) buckets.clear();
      lastSweep = now;
    }
    const id = `${key(req)}:${Math.floor(now / windowMs)}`;
    const entry = buckets.get(id) || { count: 0, resetAt: now + windowMs };
    entry.count += 1; buckets.set(id, entry);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) return res.status(429).json({ message: 'Too many requests. Please try again shortly.' });
    next();
  };
}
module.exports = { rateLimitV22, _buckets: buckets };
