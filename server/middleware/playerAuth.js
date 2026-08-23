const jwt = require('jsonwebtoken');
const Player = require('../models/Player');

async function optionalPlayer(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    if (payload.role === 'player') {
      const player = await Player.findById(payload.id).select('_id name email active activeSessionId');
      if (player && player.active !== false && payload.sid && player.activeSessionId === payload.sid) {
        req.player = { id: player._id.toString(), name: player.name, email: player.email, sid: payload.sid };
      } else {
        req.authError = { code: 'SESSION_REPLACED', message: 'This account is already active on another device. Please login again.' };
      }
    }
  } catch (error) {
    if (error && error.name === 'TokenExpiredError') {
      req.authError = { code: 'SESSION_EXPIRED', message: 'Session expired, please login again.' };
    } else if (header.startsWith('Bearer ')) {
      req.authError = { code: 'INVALID_SESSION', message: 'Session expired, please login again.' };
    }
  }
  next();
}

function requirePlayer(req, res, next) {
  optionalPlayer(req, res, () => {
    if (req.authError) return res.status(401).json(req.authError);
    if (!req.player?.id) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Please register or login before accessing quizzes.' });
    next();
  });
}
module.exports = { optionalPlayer, requirePlayer };
