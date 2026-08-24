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
    const quizzes = await Quiz.find({ liveStatus: 'live', liveEndsAt: { $gt: now } })
      .select('_id title subject topic time questions.question questions.options liveStartedAt liveEndsAt showLiveScore showLeaderboard')
      .sort({ liveStartedAt: -1 });
    res.json({ quizzes });
  } catch (e) { res.status(500).json({ message: 'Could not load live quizzes.' }); }
});

router.get('/:id/board', requirePlayer, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, liveStatus: 'live' }).select('_id title subject topic liveStatus liveEndsAt showLiveScore showLeaderboard questions.answer questions.question');
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

router.get('/:id/public', requirePlayer, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, liveStatus: 'live', liveEndsAt: { $gt: new Date() } })
      .select('_id title subject topic time maxViolations examMode liveStatus liveStartedAt liveEndsAt showLiveScore showLeaderboard questions.question questions.options');
    if (!quiz) return res.status(404).json({ message: 'Live quiz not found or has ended.' });
    res.json({ quiz });
  } catch (e) { res.status(400).json({ message: 'Could not load live quiz.' }); }
});

router.post('/direct', requireAdmin, async (req,res)=>{
  try {
    const title = String(req.body.title || '').trim();
    const subject = String(req.body.subject || 'General').trim().slice(0,80) || 'General';
    const topic = String(req.body.topic || 'General').trim().slice(0,120) || 'General';
    const duration = Math.max(1, Math.min(180, Number(req.body.duration || 30)));
    const maxViolations = Math.max(1, Math.min(20, Number(req.body.maxViolations || 3)));
    const questions = Array.isArray(req.body.questions) ? req.body.questions : [];
    if (!title) return res.status(400).json({message:'Live quiz title is required.'});
    if (!Number.isInteger(duration)) return res.status(400).json({message:'Live duration must be a whole number of minutes.'});
    if (!questions.length) return res.status(400).json({message:'Add at least one question.'});
    const cleaned = questions.map((q,i)=>{
      const question=String(q.question||'').trim();
      const options=Array.isArray(q.options)?q.options.map(x=>String(x||'').trim()):[];
      const answer=Number(q.answer);
      if(!question || options.length!==4 || options.some(x=>!x) || !Number.isInteger(answer) || answer<0 || answer>3) throw new Error(`Invalid question ${i+1}.`);
      return {question,options,answer};
    });
    const startedAt=new Date();
    const endsAt=new Date(startedAt.getTime()+duration*60000);
    const quiz=await Quiz.create({
      title,subject,topic,time:duration,liveDuration:duration,maxViolations,examMode:true,
      isPublished:false,liveStatus:'live',liveStartedAt:startedAt,liveEndsAt:endsAt,
      showLiveScore:req.body.showLiveScore!==false,showLeaderboard:req.body.showLeaderboard!==false,
      questions:cleaned,createdBy:req.admin.id
    });
    res.status(201).json({quiz});
  } catch(e){res.status(400).json({message:e.message||'Could not start direct live quiz.'});}
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
