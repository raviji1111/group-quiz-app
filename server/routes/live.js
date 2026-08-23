const express = require('express');
const Quiz = require('../models/Quiz');
const QuizSession = require('../models/QuizSession');
const Attempt = require('../models/Attempt');
const Player = require('../models/Player');
const { requireAdmin } = require('../middleware/auth');
const { requirePlayer } = require('../middleware/playerAuth');

const router = express.Router();
function getDeviceId(req) { const value = String(req.headers['x-device-id'] || '').trim(); return value && value.length <= 120 ? value : ''; }
function sameDevice(session, deviceId) { return !session.deviceId || !deviceId || String(session.deviceId) === String(deviceId); }

router.get('/active', requirePlayer, async (req, res) => {
  try {
    const now = new Date();
    const quizzes = await Quiz.find({ isPublished: true, liveStatus: 'live', liveEndsAt: { $gt: now } })
      .select('_id title subject topic time questions.question questions.options liveStartedAt liveEndsAt showLiveScore showLeaderboard liveStatus')
      .sort({ liveStartedAt: -1 });
    res.json({ quizzes });
  } catch (e) { res.status(500).json({ message: 'Could not load live quizzes.' }); }
});

router.post('/:id/join', requirePlayer, async (req, res) => {
  try {
    const deviceId = getDeviceId(req);
    if (!deviceId) return res.status(400).json({ code: 'DEVICE_ID_REQUIRED', message: 'Device ID is required. Please refresh the page and try again.' });
    const quiz = await Quiz.findOne({ _id: req.params.id, isPublished: true });
    if (!quiz) return res.status(404).json({ message: 'Live quiz not found.' });
    if (quiz.liveStatus !== 'live' || !quiz.liveEndsAt || new Date(quiz.liveEndsAt) <= new Date()) return res.status(409).json({ message: 'This live quiz is not active.' });
    const player = await Player.findById(req.player.id).select('active name');
    if (!player) return res.status(401).json({ message: 'Your account could not be found. Please login again.' });
    if (player.active === false) return res.status(403).json({ message: 'Your account is suspended.' });

    const roundKey = quiz.liveStartedAt ? new Date(quiz.liveStartedAt).toISOString() : String(quiz._id);
    const completed = await Attempt.findOne({ quiz: quiz._id, player: req.player.id, mode: 'live', roundKey });
    if (completed) return res.status(409).json({ code: 'LIVE_ALREADY_ATTEMPTED', message: 'You have already attended this live quiz.' });

    const existing = await QuizSession.findOne({ quiz: quiz._id, player: req.player.id, mode: 'live', roundKey, submitted: false }).sort({ createdAt: -1 });
    if (existing) {
      if (!sameDevice(existing, deviceId)) return res.status(409).json({ code: 'DEVICE_LOCKED', message: 'This live quiz is already open on another device.' });
      return res.json({ sessionId: existing._id, quizId: quiz._id, playerName: existing.playerName, mode: 'live', roundKey, status: 'started', startedAt: existing.startedAt, expiresAt: existing.expiresAt, time: quiz.time, maxViolations: quiz.maxViolations, currentQuestion: existing.currentQuestion, answers: existing.answers, violations: existing.violations, violationReasons: existing.violationReasons, liveStatus: 'live' });
    }

    const now = new Date();
    const expiresAt = new Date(Math.min(new Date(quiz.liveEndsAt).getTime(), now.getTime() + quiz.time * 60000));
    const session = await QuizSession.create({ quiz: quiz._id, player: req.player.id, playerName: player.name, mode: 'live', roundKey, deviceId, startedAt: now, expiresAt, joinedAt: now, answers: Array(quiz.questions.length).fill(-1) });
    res.status(201).json({ sessionId: session._id, quizId: quiz._id, playerName: player.name, mode: 'live', roundKey, status: 'started', startedAt: now, expiresAt, time: quiz.time, maxViolations: quiz.maxViolations, currentQuestion: 0, answers: session.answers, violations: 0, violationReasons: [], liveStatus: 'live' });
  } catch (e) { console.error(e); res.status(400).json({ message: 'Could not join live quiz.' }); }
});

router.get('/session/:id', requirePlayer, async (req, res) => {
  try {
    const deviceId = getDeviceId(req);
    const session = await QuizSession.findById(req.params.id);
    if (!session || session.mode !== 'live') return res.status(404).json({ message: 'Live quiz session not found.' });
    if (!session.player || String(req.player.id) !== String(session.player)) return res.status(403).json({ message: 'This quiz session belongs to another player.' });
    if (!sameDevice(session, deviceId)) return res.status(409).json({ code: 'DEVICE_LOCKED', message: 'This live quiz session is locked to another device.' });
    const quiz = await Quiz.findOne({ _id: session.quiz, isPublished: true }).select('_id title subject topic time maxViolations examMode liveStatus liveStartedAt liveEndsAt showLiveScore showLeaderboard questions.question questions.options questions.answer');
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    if (session.submitted) return res.status(409).json({ message: 'This live quiz session has already been submitted.' });
    res.json({ session: { sessionId: session._id, quizId: session.quiz, playerName: session.playerName, mode: 'live', roundKey: session.roundKey, status: 'started', startedAt: session.startedAt, expiresAt: session.expiresAt, currentQuestion: session.currentQuestion, answers: session.answers, violations: session.violations, violationReasons: session.violationReasons, submitted: session.submitted }, quiz });
  } catch (e) { res.status(400).json({ message: 'Could not resume live quiz.' }); }
});

router.patch('/session/:id/progress', requirePlayer, async (req, res) => {
  try {
    const deviceId = getDeviceId(req);
    const session = await QuizSession.findById(req.params.id);
    if (!session || session.submitted || session.mode !== 'live') return res.status(404).json({ message: 'Live quiz session not found or already submitted.' });
    if (!session.player || String(req.player.id) !== String(session.player)) return res.status(403).json({ message: 'This quiz session belongs to another player.' });
    if (!sameDevice(session, deviceId)) return res.status(409).json({ code: 'DEVICE_LOCKED', message: 'This live quiz session is locked to another device.' });
    if (Array.isArray(req.body.answers)) session.answers = req.body.answers.map(a => Number.isInteger(Number(a)) ? Number(a) : -1);
    if (Number.isInteger(Number(req.body.currentQuestion))) session.currentQuestion = Math.max(0, Number(req.body.currentQuestion));
    if (Number.isInteger(Number(req.body.violations))) session.violations = Math.max(0, Number(req.body.violations));
    if (Array.isArray(req.body.violationReasons)) session.violationReasons = req.body.violationReasons.map(String).slice(0, 20);
    await session.save(); res.json({ ok: true });
  } catch (e) { res.status(400).json({ message: 'Could not save live quiz progress.' }); }
});

router.post('/submit', requirePlayer, async (req, res) => {
  try {
    const deviceId = getDeviceId(req);
    const session = await QuizSession.findById(String(req.body.sessionId || ''));
    if (!session || session.mode !== 'live') return res.status(404).json({ message: 'Live quiz session not found.' });
    if (session.submitted) return res.status(409).json({ message: 'This live quiz session has already been submitted.' });
    if (!session.player || String(req.player.id) !== String(session.player)) return res.status(403).json({ message: 'This quiz session belongs to another player.' });
    if (!sameDevice(session, deviceId)) return res.status(409).json({ code: 'DEVICE_LOCKED', message: 'This live quiz session is locked to another device.' });
    const quiz = await Quiz.findOne({ _id: session.quiz, isPublished: true });
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    const duplicate = await Attempt.findOne({ quiz: quiz._id, player: session.player, mode: 'live', roundKey: session.roundKey });
    if (duplicate) return res.status(409).json({ code: 'LIVE_ALREADY_ATTEMPTED', message: 'You have already attended this live quiz.' });
    const requestedStatus = req.body.status === 'auto-submitted' ? 'auto-submitted' : 'completed';
    const expired = new Date() > session.expiresAt || (quiz.liveEndsAt && new Date() > new Date(quiz.liveEndsAt));
    const status = expired || requestedStatus === 'auto-submitted' ? 'auto-submitted' : 'completed';
    const sourceAnswers = Array.isArray(req.body.answers) && req.body.answers.length ? req.body.answers : session.answers;
    const safeAnswers = sourceAnswers.slice(0, quiz.questions.length).map(a => Number.isInteger(Number(a)) ? Number(a) : -1);
    let score = 0; quiz.questions.forEach((q, i) => { if (safeAnswers[i] === q.answer) score++; });
    const total = quiz.questions.length; const percentage = Math.round((score / total) * 10000) / 100;
    const violations = Math.max(0, Number(req.body.violations || 0));
    const violationReasons = Array.isArray(req.body.violationReasons) ? req.body.violationReasons.map(String).slice(0, 20) : [];
    const attempt = await Attempt.create({ quiz: quiz._id, player: session.player, playerName: session.playerName, mode: 'live', roundKey: session.roundKey, deviceId, answers: safeAnswers, score, total, percentage, violations, violationReasons, status });
    session.submitted = true; session.answers = safeAnswers; session.violations = violations; session.violationReasons = violationReasons; await session.save();
    res.status(201).json({ attemptId: attempt._id, score, total, percentage, status, expired, mode: 'live' });
  } catch (e) { console.error(e); res.status(400).json({ message: 'Could not submit live quiz.' }); }
});

router.get('/:id/board', requirePlayer, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, isPublished: true }).select('_id title subject topic liveStatus liveEndsAt showLiveScore showLeaderboard questions.answer questions.question');
    if (!quiz) return res.status(404).json({ message: 'Live quiz not found.' });
    if (quiz.liveStatus !== 'live' || !quiz.liveEndsAt || new Date(quiz.liveEndsAt) <= new Date()) return res.status(409).json({ message: 'This live quiz is not active.' });
    const sessions = await QuizSession.find({ quiz: quiz._id, mode: 'live', submitted: false }).select('player playerName answers startedAt joinedAt');
    const rows = sessions.map(s => {
      let score = 0; quiz.questions.forEach((q, i) => { if (s.answers?.[i] === q.answer) score++; });
      const answered = (s.answers || []).filter(a => Number.isInteger(a) && a >= 0).length;
      return { playerName: s.playerName, score, total: quiz.questions.length, answered, joinedAt: s.joinedAt };
    }).sort((a,b) => b.score-a.score || b.answered-a.answered || new Date(a.joinedAt)-new Date(b.joinedAt));
    const board = quiz.showLeaderboard ? rows.slice(0, 100).map((r,i)=>({...r,rank:i+1})) : [];
    const my = sessions.find(s => String(s.player) === String(req.player.id));
    let me = null;
    if (my) { let score=0; quiz.questions.forEach((q,i)=>{if(my.answers?.[i]===q.answer)score++;}); me={score,total:quiz.questions.length,answered:(my.answers||[]).filter(a=>a>=0).length}; }
    res.json({ quiz: { _id: quiz._id, title: quiz.title, subject: quiz.subject, topic: quiz.topic, liveEndsAt: quiz.liveEndsAt, showLiveScore: quiz.showLiveScore, showLeaderboard: quiz.showLeaderboard }, leaderboard: board, me, participants: sessions.length });
  } catch(e) { res.status(400).json({ message: 'Could not load live board.' }); }
});

router.post('/:id/start', requireAdmin, async (req,res)=>{
  try {
    const quiz=await Quiz.findById(req.params.id); if(!quiz) return res.status(404).json({message:'Quiz not found.'});
    const minutes=Math.max(1, Math.min(180, Number(req.body.duration || quiz.liveDuration || quiz.time)));
    quiz.liveDuration=minutes; const startAt=new Date(); const endsAt=new Date(startAt.getTime()+minutes*60000);
    quiz.time=minutes; quiz.liveStatus='live'; quiz.liveStartedAt=startAt; quiz.liveEndsAt=endsAt;
    quiz.showLiveScore=req.body.showLiveScore !== false; quiz.showLeaderboard=req.body.showLeaderboard !== false;
    await quiz.save(); res.json({quiz});
  } catch(e){res.status(400).json({message:e.message||'Could not start live quiz.'});}
});
router.post('/:id/end', requireAdmin, async (req,res)=>{
  try { const quiz=await Quiz.findById(req.params.id); if(!quiz)return res.status(404).json({message:'Quiz not found.'}); quiz.liveStatus='ended'; quiz.liveEndsAt=new Date(); await quiz.save(); res.json({quiz}); }
  catch(e){res.status(400).json({message:'Could not end live quiz.'});}
});
router.get('/:id/admin-board', requireAdmin, async (req,res)=>{
  try {
    const quiz=await Quiz.findById(req.params.id).select('_id title subject topic liveStatus liveStartedAt liveEndsAt showLiveScore showLeaderboard questions.answer');
    if(!quiz)return res.status(404).json({message:'Quiz not found.'});
    const sessions=await QuizSession.find({quiz:quiz._id, mode:'live'}).select('playerName answers submitted startedAt joinedAt');
    const rows=sessions.map(s=>{let score=0; quiz.questions.forEach((q,i)=>{if(s.answers?.[i]===q.answer)score++;}); return {playerName:s.playerName,score,total:quiz.questions.length,answered:(s.answers||[]).filter(a=>a>=0).length,submitted:s.submitted,joinedAt:s.joinedAt};}).sort((a,b)=>b.score-a.score||b.answered-a.answered);
    res.json({quiz,participants:rows.length,active:rows.filter(x=>!x.submitted).length,submitted:rows.filter(x=>x.submitted).length,leaderboard:rows.map((r,i)=>({...r,rank:i+1}))});
  }catch(e){res.status(400).json({message:'Could not load live board.'});}
});
module.exports=router;
