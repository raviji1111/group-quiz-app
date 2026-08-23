const express = require('express');
const Quiz = require('../models/Quiz');
const Attempt = require('../models/Attempt');
const QuizSession = require('../models/QuizSession');
const Player = require('../models/Player');
const { requirePlayer, optionalPlayer } = require('../middleware/playerAuth');

const router = express.Router();

function getDeviceId(req) {
  const value = String(req.headers['x-device-id'] || '').trim();
  return value && value.length <= 120 ? value : '';
}
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function playerFilter(playerId) { return { player: playerId }; }
function sameDevice(session, deviceId) {
  return !session.deviceId || !deviceId || String(session.deviceId) === String(deviceId);
}

router.post('/start', requirePlayer, async (req, res) => {
  try {
    const quizId = String(req.body.quizId || '');
    const deviceId = getDeviceId(req);
    if (!deviceId) return res.status(400).json({ code: 'DEVICE_ID_REQUIRED', message: 'Device ID is required. Please refresh the page and try again.' });
    const quiz = await Quiz.findOne({ _id: quizId, isPublished: true });
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    if (quiz.liveStatus === 'live') return res.status(409).json({ code: 'USE_LIVE_FLOW', message: 'This quiz is currently live. Please join it from Live Quiz.' });

    const player = await Player.findById(req.player.id).select('active name');
    if (!player) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Your account could not be found. Please login again.' });
    if (player.active === false) return res.status(403).json({ message: 'Your account is suspended. Please contact the administrator.' });

    const existing = await QuizSession.findOne({ quiz: quiz._id, ...playerFilter(req.player.id), mode: 'published', submitted: false }).sort({ createdAt: -1 });
    if (existing) {
      if (!sameDevice(existing, deviceId)) return res.status(409).json({ code: 'DEVICE_LOCKED', message: 'This quiz is already open on another device. Finish it on that device first.' });
      const now = new Date();
      if (now > existing.expiresAt) return res.status(409).json({ message: 'This quiz session has expired. You can start a new attempt.' });
      const waiting = new Date(existing.startedAt) > now;
      return res.json({ sessionId: existing._id, quizId: existing.quiz, playerName: existing.playerName, mode: 'published', status: waiting ? 'waiting' : 'started', startedAt: existing.startedAt, expiresAt: existing.expiresAt, time: quiz.time, maxViolations: quiz.maxViolations, currentQuestion: existing.currentQuestion, answers: existing.answers, violations: existing.violations, violationReasons: existing.violationReasons, liveStatus: 'idle' });
    }

    const now = new Date();
    const joinStart = quiz.joinStartAt ? new Date(quiz.joinStartAt) : null;
    const joinEnd = quiz.joinEndAt ? new Date(quiz.joinEndAt) : null;
    const scheduledStart = quiz.scheduledStartAt ? new Date(quiz.scheduledStartAt) : null;
    if (joinStart && now < joinStart) return res.status(403).json({ code: 'JOIN_NOT_OPEN', message: `Joining opens at ${joinStart.toLocaleString()}.` });
    if (joinEnd && now > joinEnd) return res.status(403).json({ code: 'JOIN_CLOSED', message: 'Joining for this quiz is closed.' });

    const startAt = scheduledStart || now;
    const expiresAt = new Date(startAt.getTime() + quiz.time * 60 * 1000);
    const session = await QuizSession.create({ quiz: quiz._id, player: req.player.id, playerName: player.name, mode: 'published', roundKey: null, deviceId, startedAt: startAt, expiresAt, joinedAt: now, answers: Array(quiz.questions.length).fill(-1) });
    const waiting = startAt > now;
    res.status(201).json({ sessionId: session._id, quizId: quiz._id, playerName: player.name, mode: 'published', status: waiting ? 'waiting' : 'started', startedAt: startAt, expiresAt, time: quiz.time, maxViolations: quiz.maxViolations, currentQuestion: 0, answers: session.answers, violations: 0, violationReasons: [], liveStatus: 'idle' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Could not start published quiz.' });
  }
});

router.get('/session/:id', requirePlayer, async (req, res) => {
  try {
    const deviceId = getDeviceId(req);
    const session = await QuizSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Quiz session not found.' });
    if (!session.player || String(req.player.id) !== String(session.player)) return res.status(403).json({ message: 'This quiz session belongs to another player.' });
    if (session.mode === 'live') return res.status(409).json({ code: 'USE_LIVE_FLOW', message: 'This is a live quiz session.' });
    if (!sameDevice(session, deviceId)) return res.status(409).json({ code: 'DEVICE_LOCKED', message: 'This quiz session is locked to another device.' });
    const quiz = await Quiz.findOne({ _id: session.quiz, isPublished: true }).select('_id title subject topic time maxViolations examMode liveStatus questions.question questions.options');
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    const now = new Date();
    if (!session.submitted && now > session.expiresAt && new Date(session.startedAt) <= now) return res.status(409).json({ message: 'This quiz session has expired.' });
    res.json({ session: { sessionId: session._id, quizId: session.quiz, playerName: session.playerName, mode: session.mode, status: new Date(session.startedAt) > now ? 'waiting' : 'started', startedAt: session.startedAt, expiresAt: session.expiresAt, currentQuestion: session.currentQuestion, answers: session.answers, violations: session.violations, violationReasons: session.violationReasons, submitted: session.submitted }, quiz });
  } catch (error) { console.error(error); res.status(400).json({ message: 'Could not resume published quiz.' }); }
});

router.patch('/session/:id/progress', requirePlayer, async (req, res) => {
  try {
    const deviceId = getDeviceId(req);
    const session = await QuizSession.findById(req.params.id);
    if (!session || session.submitted || session.mode !== 'published') return res.status(404).json({ message: 'Published quiz session not found or already submitted.' });
    if (!session.player || String(req.player.id) !== String(session.player)) return res.status(403).json({ message: 'This quiz session belongs to another player.' });
    if (!sameDevice(session, deviceId)) return res.status(409).json({ code: 'DEVICE_LOCKED', message: 'This quiz session is locked to another device.' });
    const answers = Array.isArray(req.body.answers) ? req.body.answers.map(a => Number.isInteger(Number(a)) ? Number(a) : -1) : session.answers;
    session.answers = answers;
    if (Number.isInteger(Number(req.body.currentQuestion))) session.currentQuestion = Math.max(0, Number(req.body.currentQuestion));
    if (Number.isInteger(Number(req.body.violations))) session.violations = Math.max(0, Number(req.body.violations));
    if (Array.isArray(req.body.violationReasons)) session.violationReasons = req.body.violationReasons.map(String).slice(0, 20);
    await session.save();
    res.json({ ok: true });
  } catch (error) { console.error(error); res.status(400).json({ message: 'Could not save quiz progress.' }); }
});

router.post('/submit', requirePlayer, async (req, res) => {
  try {
    const deviceId = getDeviceId(req);
    const sessionId = String(req.body.sessionId || '');
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const violations = Math.max(0, Number(req.body.violations || 0));
    const violationReasons = Array.isArray(req.body.violationReasons) ? req.body.violationReasons.map(String).slice(0, 20) : [];
    const requestedStatus = req.body.status === 'auto-submitted' ? 'auto-submitted' : 'completed';
    const session = await QuizSession.findById(sessionId);
    if (!session || session.mode !== 'published') return res.status(404).json({ message: 'Published quiz session not found.' });
    if (session.submitted) return res.status(409).json({ message: 'This quiz session has already been submitted.' });
    if (!session.player || String(req.player.id) !== String(session.player)) return res.status(403).json({ message: 'This quiz session belongs to another player.' });
    if (!sameDevice(session, deviceId)) return res.status(409).json({ code: 'DEVICE_LOCKED', message: 'This quiz session is locked to another device.' });
    const quiz = await Quiz.findOne({ _id: session.quiz, isPublished: true });
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    const now = new Date();
    const expired = now > session.expiresAt;
    const status = expired || requestedStatus === 'auto-submitted' ? 'auto-submitted' : 'completed';
    const sourceAnswers = answers.length ? answers : session.answers;
    const safeAnswers = sourceAnswers.slice(0, quiz.questions.length).map(a => Number.isInteger(Number(a)) ? Number(a) : -1);
    let score = 0;
    quiz.questions.forEach((q, i) => { if (safeAnswers[i] === q.answer) score++; });
    const total = quiz.questions.length;
    const percentage = Math.round((score / total) * 10000) / 100;
    const attempt = await Attempt.create({ quiz: quiz._id, player: session.player, playerName: session.playerName, mode: 'published', roundKey: null, deviceId, answers: safeAnswers, score, total, percentage, violations, violationReasons, status });
    session.submitted = true; session.answers = safeAnswers; session.violations = violations; session.violationReasons = violationReasons; await session.save();
    res.status(201).json({ attemptId: attempt._id, score, total, percentage, status, expired, mode: 'published' });
  } catch (error) { console.error(error); res.status(400).json({ message: 'Could not submit published quiz.' }); }
});

module.exports = router;
