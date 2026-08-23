const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('Invalid role');
    const admin = await Admin.findById(payload.id).select('_id email role activeSessionId');
    if (!admin || !payload.sid || admin.activeSessionId !== payload.sid) {
      return res.status(401).json({ code: 'SESSION_REPLACED', message: 'This admin account is already active on another device. Please login again.' });
    }
    req.admin = { id: admin._id.toString(), email: admin.email, role: admin.role, sid: payload.sid };
    next();
  } catch (error) {
    if (error?.code === 'SESSION_REPLACED') return res.status(401).json(error);
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

module.exports = { requireAdmin };
