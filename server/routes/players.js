const express = require('express');
const Player = require('../models/Player');
const Attempt = require('../models/Attempt');
const QuizSession = require('../models/QuizSession');
const BlockedGuest = require('../models/BlockedGuest');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();


router.get('/legacy', requireAdmin, async (req, res) => {
  try {
    const rows = await Attempt.aggregate([
      { $match: { player: null, playerName: { $exists: true, $ne: '' } } },
      { $group: { _id: { $toLower: '$playerName' }, name: { $first: '$playerName' }, attempts: { $sum: 1 }, lastAttempt: { $max: '$createdAt' } } },
      { $sort: { lastAttempt: -1 } }, { $limit: 500 }
    ]);
    const names = rows.map(r => r._id);
    const blocked = await BlockedGuest.find({ normalizedName: { $in: names } }).select('normalizedName reason createdAt').lean();
    const blockedMap = new Map(blocked.map(b => [b.normalizedName, b]));
    res.json({ players: rows.map(r => ({ name: r.name, normalizedName: r._id, attempts: r.attempts, lastAttempt: r.lastAttempt, blocked: Boolean(blockedMap.get(r._id)), reason: blockedMap.get(r._id)?.reason || '' })) });
  } catch (error) { console.error(error); res.status(500).json({ message: 'Could not load legacy users.' }); }
});

router.patch('/legacy/:name/status', requireAdmin, async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name).trim();
    const normalizedName = name.toLowerCase();
    const blocked = !Boolean(req.body.active);
    if (!name || name.length > 30) return res.status(400).json({ message: 'Invalid player name.' });
    if (blocked) await BlockedGuest.findOneAndUpdate({ normalizedName }, { name, normalizedName, reason: 'Blocked by administrator' }, { upsert: true, new: true, setDefaultsOnInsert: true });
    else await BlockedGuest.deleteOne({ normalizedName });
    res.json({ ok: true, blocked });
  } catch (error) { console.error(error); res.status(400).json({ message: 'Could not update legacy user status.' }); }
});

router.delete('/legacy/:name', requireAdmin, async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name).trim();
    const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const deleteHistory = String(req.query.deleteHistory || '') === 'true';
    if (deleteHistory) {
      await Attempt.deleteMany({ player: null, playerName: re });
      await QuizSession.deleteMany({ player: null, playerName: re });
    } else {
      await QuizSession.deleteMany({ player: null, playerName: re, submitted: false });
    }
    await BlockedGuest.deleteOne({ normalizedName: name.toLowerCase() });
    res.json({ ok: true, historyDeleted: deleteHistory });
  } catch (error) { console.error(error); res.status(400).json({ message: 'Could not delete legacy user.' }); }
});

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
