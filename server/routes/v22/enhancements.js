'use strict';
const express = require('express');
const mongoose = require('mongoose');
const { requireAdmin } = require('../../middleware/auth');
const { requirePlayer } = require('../../middleware/playerAuth');
const Player = require('../../models/Player');
const Quiz = require('../../models/Quiz');
const Attempt = require('../../models/Attempt');
const QuizSession = require('../../models/QuizSession');
const TodoTask = require('../../models/TodoTask');
const AdminAuditLog = require('../../models/v22/AdminAuditLog');
const Notification = require('../../models/v22/Notification');
const DeviceBinding = require('../../models/v22/DeviceBinding');
const crypto = require('crypto');
const { safeRegex } = require('../../services/v22Validation');
const router = express.Router();
const audit = async (req, action, targetType = '', targetId = '', details = {}) => {
  try { await AdminAuditLog.create({ actor: req.admin?.email || 'admin', action, targetType, targetId: String(targetId || ''), details, ip: req.ip || '' }); }
  catch (e) { console.error('Audit log write failed:', e.message); }
};


router.post('/device/claim', requirePlayer, async (req, res) => {
  const deviceId = String(req.body.deviceId || '').trim();
  const player = await Player.findById(req.player.id).select('active');
  if (!player || player.active === false) return res.status(403).json({ message: 'This account is inactive.' });
  if (deviceId.length < 24 || deviceId.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(deviceId)) return res.status(400).json({ message: 'A valid device identifier is required.' });
  const hash = crypto.createHash('sha256').update(deviceId).digest('hex');
  try {
    const binding = await DeviceBinding.findOne({ player: req.player.id });
    if (!binding) {
      await DeviceBinding.create({ player: req.player.id, deviceHash: hash });
      return res.status(201).json({ bound: true, message: 'This device is now registered.' });
    }
    if (binding.deviceHash !== hash) return res.status(409).json({ bound: false, code: 'DEVICE_MISMATCH', message: 'This account is already registered to another device. Ask an administrator to reset the binding.' });
    binding.lastSeenAt = new Date(); await binding.save();
    res.json({ bound: true, message: 'Device verified.' });
  } catch (e) { res.status(500).json({ message: 'Could not verify device.' }); }
});
router.get('/devices', requireAdmin, async (req, res) => {
  try { const rows = await DeviceBinding.find().populate('player', 'name email active').sort({ lastSeenAt: -1 }).limit(500).lean(); res.json({ devices: rows.map(x => ({ playerId: x.player?._id, name: x.player?.name, email: x.player?.email, active: x.player?.active, claimedAt: x.claimedAt, lastSeenAt: x.lastSeenAt })) }); }
  catch (e) { res.status(500).json({ message: 'Could not load device bindings.' }); }
});
router.delete('/devices/:playerId', requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.playerId)) return res.status(400).json({ message: 'Invalid user ID.' });
  try { const result = await DeviceBinding.deleteOne({ player: req.params.playerId }); if (!result.deletedCount) return res.status(404).json({ message: 'Device binding not found.' }); await audit(req, 'device.binding_reset', 'Player', req.params.playerId); res.json({ ok: true, message: 'Device binding reset. The user can register a new device.' }); }
  catch (e) { res.status(500).json({ message: 'Could not reset device binding.' }); }
});
router.get('/todos/calendar', requirePlayer, async (req, res) => {
  try {
    const timezone = process.env.TODO_TIMEZONE || 'Asia/Kolkata';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    const year = Number(parts.find(p => p.type === 'year').value), month = Number(parts.find(p => p.type === 'month').value);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const tasks = await TodoTask.find({ player: req.player.id, archived: false }).select('dailyLogs durationDays startDate endDate').lean();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${monthKey}-${String(day).padStart(2, '0')}`;
      const eligible = tasks.filter(t => t.startDate <= date && t.endDate >= date);
      const logs = eligible.map(t => (t.dailyLogs || []).find(l => l.date === date)).filter(Boolean);
      const completed = logs.filter(l => l.completed || Number(l.progress) >= 100).length;
      days.push({ date, eligibleTasks: eligible.length, loggedTasks: logs.length, completedTasks: completed, completionRate: logs.length ? Math.round(completed / logs.length * 100) : 0 });
    }
    const totalEligible = days.reduce((n,d)=>n+d.eligibleTasks,0), totalCompleted = days.reduce((n,d)=>n+d.completedTasks,0);
    res.json({ month: monthKey, days, summary: { totalEligibleTaskDays: totalEligible, completedTaskDays: totalCompleted, consistencyPercent: totalEligible ? Math.round(totalCompleted / totalEligible * 100) : 0 } });
  } catch (e) { res.status(500).json({ message: 'Could not load Todo consistency calendar.' }); }
});

router.get('/todos/reminders', requirePlayer, async (req, res) => {
  try {
    const tasks = await TodoTask.find({ player: req.player.id, archived: false }).select('title endDate startDate priority dailyLogs').lean();
    const timezone = process.env.TODO_TIMEZONE || 'Asia/Kolkata';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const tomorrowDate = new Date(`${today}T00:00:00Z`); tomorrowDate.setUTCDate(tomorrowDate.getUTCDate()+1); const tomorrow = tomorrowDate.toISOString().slice(0,10);
    const reminders = tasks.filter(t => t.endDate === today || t.endDate === tomorrow).map(t => ({ title: t.title, endDate: t.endDate, priority: t.priority, due: t.endDate === today ? 'today' : 'tomorrow', completedToday: (t.dailyLogs || []).some(l => l.date === today && l.completed) }));
    res.json({ today, reminders });
  } catch (e) { res.status(500).json({ message: 'Could not load Todo reminders.' }); }
});

router.get('/overview', requireAdmin, async (req, res) => {
  try {
    const [users, activeUsers, quizzes, publishedQuizzes, attempts, sessions, todoTasks] = await Promise.all([
      Player.countDocuments(), Player.countDocuments({ active: true }), Quiz.countDocuments(), Quiz.countDocuments({ isPublished: true }),
      Attempt.countDocuments(), QuizSession.countDocuments({ submitted: false }), TodoTask.countDocuments({ archived: false })
    ]);
    res.json({ users, activeUsers, quizzes, publishedQuizzes, attempts, activeSessions: sessions, activeTodoTasks: todoTasks, generatedAt: new Date().toISOString() });
  } catch (e) { res.status(500).json({ message: 'Could not load overview.' }); }
});

router.get('/analytics', requireAdmin, async (req, res) => {
  try {
    const since = new Date(); since.setDate(since.getDate() - 29); since.setHours(0,0,0,0);
    const [daily, subjects, hardQuestions, live] = await Promise.all([
      Attempt.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, attempts: { $sum: 1 }, average: { $avg: '$percentage' } } }, { $sort: { _id: 1 } }]),
      Attempt.aggregate([{ $lookup: { from: 'quizzes', localField: 'quiz', foreignField: '_id', as: 'quizDoc' } }, { $unwind: '$quizDoc' }, { $group: { _id: { $ifNull: ['$quizDoc.subject', 'General'] }, attempts: { $sum: 1 }, average: { $avg: '$percentage' } } }, { $sort: { attempts: -1 } }, { $limit: 15 }]),
      Attempt.aggregate([{ $group: { _id: '$quiz', attempts: { $sum: 1 }, average: { $avg: '$percentage' } } }, { $lookup: { from: 'quizzes', localField: '_id', foreignField: '_id', as: 'quizDoc' } }, { $unwind: '$quizDoc' }, { $project: { title: '$quizDoc.title', subject: '$quizDoc.subject', attempts: 1, average: { $round: ['$average', 1] } } }, { $sort: { average: 1, attempts: -1 } }, { $limit: 10 }]),
      Quiz.aggregate([{ $match: { liveStatus: { $in: ['live', 'ended'] } } }, { $project: { title: 1, liveStatus: 1, liveStartedAt: 1, liveEndsAt: 1, livePaused: 1 } }, { $sort: { updatedAt: -1 } }, { $limit: 20 }])
    ]);
    res.json({ since: since.toISOString(), daily, subjects, difficultQuizzes: hardQuestions, liveSessions: live });
  } catch (e) { console.error('v22 analytics:', e.message); res.status(500).json({ message: 'Could not load analytics.' }); }
});

router.get('/users', requireAdmin, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const filter = search ? { $or: [{ name: { $regex: safeRegex(search), $options: 'i' } }, { email: { $regex: safeRegex(search), $options: 'i' } }] } : {};
    const players = await Player.find(filter).select('_id name email active createdAt').sort({ createdAt: -1 }).limit(200).lean();
    const ids = players.map(p => p._id);
    const counts = await Attempt.aggregate([{ $match: { player: { $in: ids } } }, { $group: { _id: '$player', attempts: { $sum: 1 }, best: { $max: '$percentage' }, last: { $max: '$createdAt' } } }]);
    const byId = new Map(counts.map(c => [String(c._id), c]));
    res.json({ users: players.map(p => ({ ...p, ...(byId.get(String(p._id)) || { attempts: 0, best: 0, last: null }) })) });
  } catch (e) { res.status(500).json({ message: 'Could not load users.' }); }
});

router.get('/users/:id/history', requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID.' });
  try {
    const [player, attempts, todos] = await Promise.all([
      Player.findById(req.params.id).select('_id name email active createdAt').lean(),
      Attempt.find({ player: req.params.id }).populate('quiz', 'title subject topic').select('quiz score total percentage status createdAt').sort({ createdAt: -1 }).limit(100).lean(),
      TodoTask.find({ player: req.params.id }).select('title category durationType startDate endDate archived dailyLogs createdAt').sort({ createdAt: -1 }).limit(100).lean()
    ]);
    if (!player) return res.status(404).json({ message: 'User not found.' });
    res.json({ player, attempts, todos: todos.map(t => ({ ...t, dailyLogCount: (t.dailyLogs || []).length, dailyLogs: undefined })) });
  } catch (e) { res.status(500).json({ message: 'Could not load user history.' }); }
});

router.patch('/users/:id/status', requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || typeof req.body.active !== 'boolean') return res.status(400).json({ message: 'A valid user ID and boolean active value are required.' });
  try {
    const player = await Player.findByIdAndUpdate(req.params.id, { active: req.body.active }, { new: true }).select('_id name email active createdAt');
    if (!player) return res.status(404).json({ message: 'User not found.' });
    if (!player.active) await QuizSession.updateMany({ player: player._id, submitted: false }, { $set: { submitted: true, submittedAt: new Date() } });
    await audit(req, player.active ? 'user.activated' : 'user.suspended', 'Player', player._id, { email: player.email });
    res.json({ player });
  } catch (e) { res.status(500).json({ message: 'Could not update user status.' }); }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user ID.' });
  try {
    const player = await Player.findById(req.params.id).select('_id name email');
    if (!player) return res.status(404).json({ message: 'User not found.' });
    if (req.query.deleteHistory === 'true') {
      await Promise.all([Attempt.deleteMany({ player: player._id }), QuizSession.deleteMany({ player: player._id }), TodoTask.deleteMany({ player: player._id })]);
    } else {
      await Attempt.updateMany({ player: player._id }, { $set: { player: null } });
      await QuizSession.deleteMany({ player: player._id, submitted: false });
      // Todo ownership is retained only when preserving history is requested; task data has no player after deletion, so remove it to avoid orphaned private data.
      await TodoTask.deleteMany({ player: player._id });
    }
    await DeviceBinding.deleteOne({ player: player._id });
    await Player.deleteOne({ _id: player._id });
    await audit(req, 'user.deleted', 'Player', player._id, { email: player.email, deleteHistory: req.query.deleteHistory === 'true' });
    res.json({ ok: true, historyDeleted: req.query.deleteHistory === 'true', todoDataDeleted: true });
  } catch (e) { res.status(500).json({ message: 'Could not delete user.' }); }
});

router.get('/notifications', requireAdmin, async (req, res) => {
  try { res.json({ notifications: await Notification.find({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).sort({ createdAt: -1 }).limit(100).lean() }); }
  catch (e) { res.status(500).json({ message: 'Could not load notifications.' }); }
});
router.post('/notifications', requireAdmin, async (req, res) => {
  const title = String(req.body.title || '').trim(), message = String(req.body.message || '').trim();
  if (!title || title.length > 120 || !message || message.length > 1000) return res.status(400).json({ message: 'Title and message are required (120/1000 character limits).' });
  const audience = ['all', 'players'].includes(req.body.audience) ? req.body.audience : 'all';
  try {
    const notification = await Notification.create({ title, message, audience, createdBy: req.admin?.email || 'admin' });
    await audit(req, 'notification.created', 'Notification', notification._id, { audience });
    res.status(201).json({ notification });
  } catch (e) { res.status(500).json({ message: 'Could not create notification.' }); }
});
router.get('/notifications/mine', requirePlayer, async (req, res) => {
  try { const notifications = await Notification.find({ audience: { $in: ['all', 'players'] }, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).sort({ createdAt: -1 }).limit(30).select('title message createdAt expiresAt').lean(); res.json({ notifications }); }
  catch (e) { res.status(500).json({ message: 'Could not load notifications.' }); }
});

router.get('/audit', requireAdmin, async (req, res) => {
  try { res.json({ events: await AdminAuditLog.find().sort({ createdAt: -1 }).limit(200).lean() }); }
  catch (e) { res.status(500).json({ message: 'Could not load audit log.' }); }
});

router.get('/backup/export', requireAdmin, async (req, res) => {
  try {
    const [players, quizzes, attempts, sessions, todos, notifications, auditLogs, devices] = await Promise.all([
      Player.find().lean(), Quiz.find().lean(), Attempt.find().lean(), QuizSession.find().lean(), TodoTask.find().lean(), Notification.find().lean(), AdminAuditLog.find().lean(), DeviceBinding.find().lean()
    ]);
    const snapshot = { format: 'group-quiz-backup-v1', createdAt: new Date().toISOString(), collections: { players, quizzes, attempts, sessions, todos, notifications, auditLogs, devices } };
    await audit(req, 'backup.exported', 'Backup', '', { counts: Object.fromEntries(Object.entries(snapshot.collections).map(([k,v]) => [k,v.length])) });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="group-quiz-backup-${new Date().toISOString().slice(0,10)}.json"`);
    res.send(JSON.stringify(snapshot));
  } catch (e) { console.error('Backup export failed:', e.message); res.status(500).json({ message: 'Backup export failed.' }); }
});

router.post('/backup/validate', requireAdmin, async (req, res) => {
  const snap = req.body;
  const allowed = ['players','quizzes','attempts','sessions','todos','notifications','auditLogs'];
  if (!snap || snap.format !== 'group-quiz-backup-v1' || !snap.collections || allowed.some(k => !Array.isArray(snap.collections[k])) || (snap.collections.devices !== undefined && !Array.isArray(snap.collections.devices))) return res.status(400).json({ message: 'Invalid backup structure.' });
  const counts = Object.fromEntries(allowed.map(k => [k, snap.collections[k].length]));
  await audit(req, 'backup.validated', 'Backup', '', { counts });
  res.json({ valid: true, counts, message: 'Backup structure is valid. No database records were changed.' });
});

router.post('/backup/restore', requireAdmin, async (req, res) => {
  const snap = req.body;
  const keys = ['players','quizzes','attempts','sessions','todos','notifications','auditLogs'];
  if (req.body.confirmText !== 'RESTORE ALL DATA') return res.status(400).json({ message: 'Explicit confirmation is required: RESTORE ALL DATA.' });
  if (!snap || snap.format !== 'group-quiz-backup-v1' || !snap.collections || keys.some(k => !Array.isArray(snap.collections[k])) || (snap.collections.devices !== undefined && !Array.isArray(snap.collections.devices))) {
    return res.status(400).json({ message: 'Invalid backup structure. Validate the backup before restoring.' });
  }
  const total = keys.reduce((n,k)=>n+snap.collections[k].length,0) + (snap.collections.devices || []).length;
  if (total > 100000) return res.status(413).json({ message: 'Backup exceeds the 100,000-record safety limit.' });
  const mappings = [
    [Player, snap.collections.players], [Quiz, snap.collections.quizzes], [Attempt, snap.collections.attempts],
    [QuizSession, snap.collections.sessions], [TodoTask, snap.collections.todos], [Notification, snap.collections.notifications],
    [AdminAuditLog, snap.collections.auditLogs], [DeviceBinding, snap.collections.devices || []]
  ];
  let session;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      for (const [Model, docs] of mappings) {
        await Model.deleteMany({}, { session });
        if (docs.length) await Model.insertMany(docs, { session, ordered: true });
      }
    });
    await audit(req, 'backup.restored', 'Backup', '', { records: total, sourceCreatedAt: snap.createdAt || null });
    res.json({ ok: true, restoredRecords: total, message: 'Backup restored successfully. Admin credentials were intentionally preserved.' });
  } catch (e) {
    console.error('Backup restore failed:', e.message);
    res.status(500).json({ message: 'Restore failed. The database may require MongoDB transaction support (replica set). Check server logs before retrying.' });
  } finally { if (session) await session.endSession(); }
});

router.get('/health/deep', requireAdmin, async (req, res) => {
  const db = mongoose.connection.readyState === 1;
  const checks = { database: db, modelsLoaded: Boolean(Player && Quiz && Attempt && TodoTask), timestamp: new Date().toISOString() };
  res.status(db ? 200 : 503).json({ ok: db && checks.modelsLoaded, checks });
});

module.exports = router;
