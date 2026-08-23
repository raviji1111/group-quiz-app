const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Player = require('../models/Player');

const router = express.Router();
function sign(player) { return jwt.sign({ id: player._id.toString(), role: 'player', name: player.name, email: player.email, sid: player.activeSessionId }, process.env.JWT_SECRET, { expiresIn: '12h' }); }

router.post('/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name || name.length > 30 || !email || password.length < 6) return res.status(400).json({ message: 'Name, valid email and password (6+ characters) are required.' });
    if (await Player.findOne({ email })) return res.status(409).json({ message: 'An account with this email already exists.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const player = await Player.create({ name, email, passwordHash, activeSessionId: crypto.randomUUID() });
    res.status(201).json({ token: sign(player), player: { id: player._id, name: player.name, email: player.email } });
  } catch (error) { console.error(error); res.status(400).json({ message: 'Registration failed.' }); }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const player = await Player.findOne({ email });
    if (!player || !(await bcrypt.compare(password, player.passwordHash))) return res.status(401).json({ message: 'Invalid email or password.' });
    if (player.active === false) return res.status(403).json({ message: 'Your account is deactivated. Please contact the administrator.' });
    player.activeSessionId = crypto.randomUUID();
    await player.save();
    res.json({ token: sign(player), player: { id: player._id, name: player.name, email: player.email } });
  } catch (error) { console.error(error); res.status(500).json({ message: 'Login failed.' }); }
});

router.post('/logout', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.role === 'player' && payload.sid) {
          await Player.findOneAndUpdate({ _id: payload.id, activeSessionId: payload.sid }, { $set: { activeSessionId: null } });
        }
      } catch {}
    }
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Logout failed.' }); }
});

module.exports = router;
