const express = require('express');
const Quiz = require('../models/Quiz');
const Attempt = require('../models/Attempt');
const QuizSession = require('../models/QuizSession');
const { requireAdmin } = require('../middleware/auth');
const { optionalPlayer } = require('../middleware/playerAuth');
const Player = require('../models/Player');

const router = express.Router();

router.post('/start', optionalPlayer, async (req, res) => {
  try {
    const quizId = String(req.body.quizId || '');
    const quiz = await Quiz.findOne({ _id: quizId, isPublished: true });
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    if (quiz.liveStatus === 'live') {
      const liveEnds = quiz.liveEndsAt ? new Date(quiz.liveEndsAt) : null;
      if (!liveEnds || liveEnds <= new Date()) { quiz.liveStatus = 'ended'; await quiz.save(); return res.status(409).json({ message: 'This live quiz has ended.' }); }
    }
    if (quiz.liveStatus === 'ended' && req.body.live === true) return res.status(409).json({ message: 'This live quiz has ended.' });

    const playerId = req.player?.id || null;
    if (!playerId) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Please register or login before attempting a quiz.' });
    const player = await Player.findById(playerId).select('active name');
    if (!player) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Your account could not be found. Please register or login again.' });
    if (player.active === false) return res.status(403).json({ message: 'Your account is suspended. Please contact the administrator.' });
    const playerName = player.name;
    const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const safePlayerName = escapeRegex(playerName);
    const playerFilter = playerId ? { player: playerId } : { player: null, playerName: new RegExp(`^${safePlayerName}$`, 'i') };
    const existing = await QuizSession.findOne({ quiz: quiz._id, ...playerFilter, submitted: false }).sort({ createdAt: -1 });
    const completed = await Attempt.findOne({ quiz: quiz._id, ...(playerId ? { player: playerId } : { player: null, playerName: new RegExp(`^${safePlayerName}$`, 'i') }) });
    if (completed) return res.status(409).json({ message: 'You have already completed this quiz.' });

    const now = new Date();
    const joinStart = quiz.joinStartAt ? new Date(quiz.joinStartAt) : null;
    const joinEnd = quiz.joinEndAt ? new Date(quiz.joinEndAt) : null;
    const scheduledStart = quiz.scheduledStartAt ? new Date(quiz.scheduledStartAt) : null;

    if (!existing) {
      if (joinStart && now < joinStart) return res.status(403).json({ code: 'JOIN_NOT_OPEN', message: `Joining opens at ${joinStart.toLocaleString()}.` });
      if (joinEnd && now > joinEnd) return res.status(403).json({ code: 'JOIN_CLOSED', message: 'Joining for this quiz is closed.' });
      const startAt = scheduledStart || now;
      const expiresAt = new Date(startAt.getTime() + quiz.time * 60 * 1000);
      const session = await QuizSession.create({ quiz: quiz._id, playerName, player: playerId, startedAt: startAt, expiresAt, joinedAt: now, answers: Array(quiz.questions.length).fill(-1) });
      const waiting = startAt > now;
      return res.status(201).json({ sessionId: session._id, quizId: quiz._id, status: waiting ? 'waiting' : 'started', startedAt: startAt, expiresAt, time: quiz.time, maxViolations: quiz.maxViolations, currentQuestion: 0, answers: session.answers, liveStatus: quiz.liveStatus });
    }

    const waiting = new Date(existing.startedAt) > now;
    if (!waiting && now > existing.expiresAt) return res.status(409).json({ message: 'This quiz session has expired.' });
    return res.json({ sessionId: existing._id, quizId: existing.quiz, status: waiting ? 'waiting' : 'started', startedAt: existing.startedAt, expiresAt: existing.expiresAt, time: quiz.time, maxViolations: quiz.maxViolations, currentQuestion: existing.currentQuestion, answers: existing.answers, violations: existing.violations, violationReasons: existing.violationReasons });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Could not join quiz.' });
  }
});

router.get('/session/:id', optionalPlayer, async (req, res) => {
  try {
    const session = await QuizSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Quiz session not found.' });
    if (!req.player?.id) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Please login to resume this quiz.' });
    if (!session.player || String(req.player.id) !== String(session.player)) return res.status(403).json({ message: 'This quiz session belongs to another player.' });
    const quiz = await Quiz.findOne({ _id: session.quiz, isPublished: true }).select('_id title time maxViolations examMode questions.question questions.options');
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    const now = new Date();
    if (!session.submitted && now > session.expiresAt && new Date(session.startedAt) <= now) return res.status(409).json({ message: 'This quiz session has expired.' });
    res.json({ session: { sessionId: session._id, quizId: session.quiz, status: new Date(session.startedAt) > now ? 'waiting' : 'started', startedAt: session.startedAt, expiresAt: session.expiresAt, currentQuestion: session.currentQuestion, answers: session.answers, violations: session.violations, violationReasons: session.violationReasons, submitted: session.submitted }, quiz });
  } catch (error) { console.error(error); res.status(400).json({ message: 'Could not resume quiz session.' }); }
});

router.patch('/session/:id/progress', async (req, res) => {
  try {
    const session = await QuizSession.findById(req.params.id);
    if (!session || session.submitted) return res.status(404).json({ message: 'Quiz session not found or already submitted.' });
    const answers = Array.isArray(req.body.answers) ? req.body.answers.map(a => Number.isInteger(Number(a)) ? Number(a) : -1) : session.answers;
    session.answers = answers;
    if (Number.isInteger(Number(req.body.currentQuestion))) session.currentQuestion = Math.max(0, Number(req.body.currentQuestion));
    if (Number.isInteger(Number(req.body.violations))) session.violations = Math.max(0, Number(req.body.violations));
    if (Array.isArray(req.body.violationReasons)) session.violationReasons = req.body.violationReasons.map(String).slice(0, 20);
    await session.save();
    res.json({ ok: true });
  } catch (error) { console.error(error); res.status(400).json({ message: 'Could not save quiz progress.' }); }
});

router.post('/', async (req, res) => {
  try {
    const sessionId = String(req.body.sessionId || '');
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const violations = Math.max(0, Number(req.body.violations || 0));
    const violationReasons = Array.isArray(req.body.violationReasons) ? req.body.violationReasons.map(String).slice(0, 20) : [];
    const requestedStatus = req.body.status === 'auto-submitted' ? 'auto-submitted' : 'completed';

    const session = await QuizSession.findById(sessionId);
    if (!session) return res.status(404).json({ message: 'Quiz session not found.' });
    if (session.submitted) return res.status(409).json({ message: 'This quiz session has already been submitted.' });

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

    const attempt = await Attempt.create({ quiz: quiz._id, player: session.player || null, playerName: session.playerName, answers: safeAnswers, score, total, percentage, violations, violationReasons, status });
    session.submitted = true;
    session.answers = safeAnswers;
    session.violations = violations;
    session.violationReasons = violationReasons;
    await session.save();

    res.status(201).json({ attemptId: attempt._id, score, total, percentage, status, expired });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Could not submit attempt.' });
  }
});

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [totalAttempts, aggregate] = await Promise.all([
      Attempt.countDocuments(),
      Attempt.aggregate([{ $group: { _id: null, avgPercentage: { $avg: '$percentage' }, totalViolations: { $sum: '$violations' } } }])
    ]);
    res.json({ totalAttempts, avgPercentage: aggregate[0]?.avgPercentage || 0, totalViolations: aggregate[0]?.totalViolations || 0 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load stats.' });
  }
});

router.get('/by-quiz', requireAdmin, async (req, res) => {
  try {
    const groups = await Attempt.aggregate([
      { $group: {
        _id: '$quiz',
        attempts: { $sum: 1 },
        avgPercentage: { $avg: '$percentage' },
        bestPercentage: { $max: '$percentage' },
        lastAttempt: { $max: '$createdAt' }
      } },
      { $sort: { lastAttempt: -1 } },
      { $limit: 100 }
    ]);

    const quizIds = groups.map(g => g._id).filter(Boolean);
    const quizzes = await Quiz.find({ _id: { $in: quizIds } }).select('_id title isPublished createdAt');
    const quizMap = new Map(quizzes.map(q => [String(q._id), q]));

    res.json({
      quizzes: groups.map(g => ({
        quizId: g._id,
        title: quizMap.get(String(g._id))?.title || 'Deleted quiz',
        isPublished: quizMap.get(String(g._id))?.isPublished ?? false,
        attempts: g.attempts,
        avgPercentage: Math.round((g.avgPercentage || 0) * 100) / 100,
        bestPercentage: Math.round((g.bestPercentage || 0) * 100) / 100,
        lastAttempt: g.lastAttempt
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load results by quiz.' });
  }
});

router.get('/leaderboard', requireAdmin, async (req, res) => {
  try {
    const quizId = req.query.quizId ? String(req.query.quizId) : null;
    const match = quizId ? { quiz: new (require('mongoose').Types.ObjectId)(quizId) } : {};
    const rows = await Attempt.aggregate([
      { $match: match },
      { $group: { _id: '$playerName', attempts: { $sum: 1 }, bestScore: { $max: '$percentage' }, avgScore: { $avg: '$percentage' } } },
      { $sort: { bestScore: -1, avgScore: -1, attempts: -1 } },
      { $limit: 50 }
    ]);
    res.json({ leaderboard: rows.map((r, i) => ({ rank: i + 1, playerName: r._id, attempts: r.attempts, bestScore: Math.round(r.bestScore * 100) / 100, avgScore: Math.round(r.avgScore * 100) / 100 })) });
  } catch (error) { console.error(error); res.status(400).json({ message: 'Could not load leaderboard.' }); }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const filter = req.query.quizId ? { quiz: req.query.quizId } : {};
    const attempts = await Attempt.find(filter).populate('quiz', 'title').sort({ createdAt: -1 }).limit(500);
    res.json({ attempts });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load attempt history.' });
  }
});

router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const attempt = await Attempt.findById(req.params.id).populate('quiz', 'title questions');
    if (!attempt) return res.status(404).json({ message: 'Attempt not found.' });
    const questions = attempt.quiz?.questions || [];
    const details = questions.map((q, i) => ({
      number: i + 1, question: q.question, options: q.options, correctAnswer: q.answer,
      selectedAnswer: Number.isInteger(attempt.answers?.[i]) ? attempt.answers[i] : -1,
      result: attempt.answers?.[i] === q.answer ? 'correct' : (attempt.answers?.[i] >= 0 ? 'wrong' : 'skipped')
    }));
    res.json({ attempt: { id: attempt._id, playerName: attempt.playerName, quizName: attempt.quiz?.title || 'Deleted quiz', score: attempt.score, total: attempt.total, percentage: attempt.percentage, violations: attempt.violations, violationReasons: attempt.violationReasons, status: attempt.status, createdAt: attempt.createdAt, details } });
  } catch (error) { console.error(error); res.status(400).json({ message: 'Could not load attempt details.' }); }
});

module.exports = router;
