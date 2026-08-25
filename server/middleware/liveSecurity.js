const crypto = require('crypto');

const buckets = new Map();

// Small in-memory limiter avoids a new dependency. For multi-instance deployments,
// replace this adapter with Redis while preserving the same middleware contract.
function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  return (req, res, next) => {
    const identity = req.admin?.id || req.player?.id || req.ip || 'unknown';
    const key = `${req.baseUrl}:${req.route?.path || req.path}:${identity}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ message: 'Too many requests. Please retry shortly.' });
    }
    next();
  };
}

function hashIp(req) {
  // Audit usefulness without storing a raw IP address.
  return crypto.createHash('sha256').update(String(req.ip || '')).digest('hex').slice(0, 20);
}

function requireObjectId(param = 'id') {
  return (req, res, next) => /^[a-f\d]{24}$/i.test(String(req.params[param] || ''))
    ? next()
    : res.status(400).json({ message: 'Invalid resource id.' });
}

module.exports = { rateLimit, hashIp, requireObjectId };

