const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required in .env');

  const existing = await Admin.findOne({ email });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash(password, 12);
  return Admin.create({ email, passwordHash, role: 'admin' });
}

module.exports = { ensureAdmin };
