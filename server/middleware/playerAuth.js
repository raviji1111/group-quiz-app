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
module.exports = { optionalPlayer };
