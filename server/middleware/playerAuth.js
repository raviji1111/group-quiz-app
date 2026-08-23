const jwt = require('jsonwebtoken');
function optionalPlayer(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    if (payload.role === 'player') req.player = payload;
  } catch {}
  next();
}
function requirePlayer(req, res, next) {
  optionalPlayer(req, res, () => {
    if (!req.player?.id) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Please register or login before accessing quizzes.' });
    next();
  });
}
module.exports = { optionalPlayer, requirePlayer };
