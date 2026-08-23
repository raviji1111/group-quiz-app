const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Admin = require('../models/Admin');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

    const admin = await Admin.findOne({ email });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const sessionId = crypto.randomUUID();
    admin.activeSessionId = sessionId;
    await admin.save();
    const token = jwt.sign({ id: admin._id.toString(), role: admin.role, email: admin.email, sid: sessionId }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, admin: { email: admin.email, role: admin.role } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Login failed.' });
  }
});

router.post('/logout', requireAdmin, async (req, res) => {
  try {
    await Admin.findByIdAndUpdate(req.admin.id, { $set: { activeSessionId: null } });
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Logout failed.' }); }
});

router.get('/me', requireAdmin, (req, res) => {
  res.json({ admin: { email: req.admin.email, role: req.admin.role } });
});

module.exports = router;
