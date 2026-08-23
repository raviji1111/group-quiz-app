const express = require('express');
const mongoose = require('mongoose');
const Quiz = require('../models/Quiz');
const QuizSession = require('../models/QuizSession');
const Attempt = require('../models/Attempt');
const { requireAdmin } = require('../middleware/auth');
const { requirePlayer } = require('../middleware/playerAuth');

const router = express.Router();

router.get('/active', requirePlayer, async (req, res) => {
  try {
    const now = new Date();
    const quizzes = await Quiz.find({ isPublished: true, liveStatus: 'live', liveEndsAt: { $gt: now } })
      .select('_id title subject topic time questions.question questions.options liveStartedAt liveEndsAt showLiveScore showLeaderboard')
      .sort({ liveStartedAt: -1 });
    res.json({ quizzes });
  } catch (e) { res.status(500).json({ message: 'Could not load live quizzes.' }); }
});

router.get('/:id/board', requirePlayer, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, isPublished: true }).select('_id title subject topic liveStatus liveEndsAt showLiveScore showLeaderboard questions.answer questions.question');
    if (!quiz) return res.status(404).json({ message: 'Live quiz not found.' });
    if (quiz.liveStatus !== 'live' || !quiz.liveEndsAt || new Date(quiz.liveEndsAt) <= new Date()) return res.status(409).json({ message: 'This live quiz is not active.' });
    const sessions = await QuizSession.find({ quiz: quiz._id, submitted: false }).select('player playerName answers startedAt joinedAt');
    const rows = sessions.map(s => {
      let score = 0;
      quiz.questions.forEach((q, i) => { if (s.answers?.[i] === q.answer) score++; });
      const answered = (s.answers || []).filter(a => Number.isInteger(a) && a >= 0).length;
      return { playerName: s.playerName, score, total: quiz.questions.length, answered, joinedAt: s.joinedAt };
    }).sort((a,b) => b.score-a.score || a.answered-b.answered || new Date(a.joinedAt)-new Date(b.joinedAt));
    const board = quiz.showLeaderboard ? rows.slice(0, 100).map((r,i)=>({...r,rank:i+1})) : [];
    let me = null;
    const my = sessions.find(s => String(s.player) === String(req.player.id));
    if (my) { let score=0; quiz.questions.forEach((q,i)=>{if(my.answers?.[i]===q.answer)score++;}); me={score,total:quiz.questions.length,answered:(my.answers||[]).filter(a=>a>=0).length}; }
    res.json({ quiz: { _id: quiz._id, title: quiz.title, subject: quiz.subject, topic: quiz.topic, liveEndsAt: quiz.liveEndsAt, showLiveScore: quiz.showLiveScore, showLeaderboard: quiz.showLeaderboard }, leaderboard: board, me, participants: sessions.length });
  } catch(e) { res.status(400).json({ message: 'Could not load live board.' }); }
});

router.post('/:id/start', requireAdmin, async (req,res)=>{
  try {
    const quiz=await Quiz.findById(req.params.id); if(!quiz) return res.status(404).json({message:'Quiz not found.'});
    const minutes=Math.max(1, Math.min(180, Number(req.body.duration || quiz.liveDuration || quiz.time)));
    quiz.liveDuration=minutes;
    const startAt=new Date(); const endsAt=new Date(startAt.getTime()+minutes*60000);
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
    const sessions=await QuizSession.find({quiz:quiz._id}).select('playerName answers submitted startedAt joinedAt');
    const rows=sessions.map(s=>{let score=0; quiz.questions.forEach((q,i)=>{if(s.answers?.[i]===q.answer)score++;}); return {playerName:s.playerName,score,total:quiz.questions.length,answered:(s.answers||[]).filter(a=>a>=0).length,submitted:s.submitted,joinedAt:s.joinedAt};}).sort((a,b)=>b.score-a.score||a.answered-b.answered);
    res.json({quiz,participants:rows.length,active:rows.filter(x=>!x.submitted).length,submitted:rows.filter(x=>x.submitted).length,leaderboard:rows.map((r,i)=>({...r,rank:i+1}))});
  }catch(e){res.status(400).json({message:'Could not load live board.'});}
});
module.exports=router;
