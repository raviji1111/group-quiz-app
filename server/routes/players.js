const express = require('express');
const Player = require('../models/Player');
const Attempt = require('../models/Attempt');
const QuizSession = require('../models/QuizSession');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAdmin, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const filter = search ? { $or: [
      { name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { email: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
    ] } : {};
    const players = await Player.find(filter).select('_id name email active createdAt').sort({ createdAt: -1 }).limit(500).lean();
    const ids = players.map(p => p._id);
    const counts = await Attempt.aggregate([
      { $match: { player: { $in: ids } } },
      { $group: { _id: '$player', attempts: { $sum: 1 }, best: { $max: '$percentage' } } }
    ]);
    const map = new Map(counts.map(c => [String(c._id), c]));
    res.json({ players: players.map(p => ({ ...p, attempts: map.get(String(p._id))?.attempts || 0, best: Math.round((map.get(String(p._id))?.best || 0) * 100) / 100 })) });
  } catch (error) { console.error(error); res.status(500).json({ message: 'Could not load users.' }); }
});

router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const active = Boolean(req.body.active);
    const player = await Player.findByIdAndUpdate(req.params.id, { active }, { new: true }).select('_id name email active createdAt');
    if (!player) return res.status(404).json({ message: 'User not found.' });
    if (!active) await QuizSession.updateMany({ player: player._id, submitted: false }, { $set: { submitted: true } });
    res.json({ player });
  } catch (error) { console.error(error); res.status(400).json({ message: 'Could not update user status.' }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ message: 'User not found.' });
    const deleteHistory = String(req.query.deleteHistory || '') === 'true';
    if (deleteHistory) {
      await Promise.all([
        Attempt.deleteMany({ player: player._id }),
        QuizSession.deleteMany({ player: player._id }),
        Player.deleteOne({ _id: player._id })
      ]);
      return res.json({ ok: true, historyDeleted: true });
    }
    await Attempt.updateMany({ player: player._id }, { $set: { player: null } });
    await QuizSession.deleteMany({ player: player._id, submitted: false });
    await Player.deleteOne({ _id: player._id });
    res.json({ ok: true, historyDeleted: false });
  } catch (error) { console.error(error); res.status(400).json({ message: 'Could not delete user.' }); }
});

module.exports = router;
