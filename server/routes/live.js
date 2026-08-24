const express = require('express');
const mongoose = require('mongoose');
const Quiz = require('../models/Quiz');
const QuizSession = require('../models/QuizSession');
const Attempt = require('../models/Attempt');
const { requireAdmin } = require('../middleware/auth');
const { requirePlayer } = require('../middleware/playerAuth');

const router = express.Router();


async function finalizeExpiredLiveQuiz(quiz) {
  if (!quiz?.liveEndsAt || new Date(quiz.liveEndsAt) > new Date()) return false;
  if (quiz.liveStatus === 'live' && typeof quiz.save === 'function') {
    const locked = await Quiz.findOneAndUpdate({ _id: quiz._id, liveStatus: 'live' }, { $set: { liveStatus: 'ended' } }, { new: true });
    if (!locked) return false;
    quiz.liveStatus = 'ended';
  }
  const sessions = await QuizSession.find({ quiz: quiz._id, submitted: false });
  for (const session of sessions) {
    const safeAnswers = (session.answers || []).slice(0, quiz.questions.length).map(a => Number.isInteger(Number(a)) ? Number(a) : -1);
    let score = 0;
    quiz.questions.forEach((q, i) => { if (safeAnswers[i] === q.answer) score++; });
    const total = quiz.questions.length;
    const percentage = total ? Math.round((score / total) * 10000) / 100 : 0;
    await Attempt.create({ quiz: quiz._id, player: session.player || null, playerName: session.playerName, answers: safeAnswers, score, total, percentage, violations: session.violations || 0, violationReasons: session.violationReasons || [], status: 'auto-submitted' });
    session.submitted = true;
    await session.save();
  }
  return true;
}


setInterval(async () => {
  try {
    const expired = await Quiz.find({ liveStatus: 'live', liveEndsAt: { $lte: new Date() } });
    for (const quiz of expired) await finalizeExpiredLiveQuiz(quiz);
  } catch (e) { console.error('Live auto-close error:', e.message); }
}, 5000);

router.get('/active', requirePlayer, async (req, res) => {
  try {
    const now = new Date();
    const candidates = await Quiz.find({ liveStatus: 'live', liveEndsAt: { $gt: now } });
    for (const q of candidates) await finalizeExpiredLiveQuiz(q);
    // Keep a live card visible for the whole LIVE window so students can see
    // the exact state/countdown before join opens and after join closes.
    // The actual join permission is enforced again by /attempts/start.
    const quizzes = await Quiz.find({ liveStatus: 'live', liveEndsAt: { $gt: now } })
      .select('_id title subject topic time questions.question questions.options liveLaunchAt liveJoinOpenAt liveJoinCloseAt liveStartedAt liveEndsAt showLiveScore showLeaderboard')
      .sort({ liveStartedAt: 1, liveLaunchAt: -1 });
    res.json({ quizzes });
  } catch (e) { res.status(500).json({ message: 'Could not load live quizzes.' }); }
});

router.post('/heartbeat/:sessionId', requirePlayer, async (req,res)=>{
  try {
    const session=await QuizSession.findById(req.params.sessionId);
    if(!session || !session.player || String(session.player)!==String(req.player.id) || session.submitted) return res.status(404).json({message:'Session not active.'});
    session.lastSeenAt=new Date(); await session.save(); res.json({ok:true,lastSeenAt:session.lastSeenAt});
  } catch(e){res.status(400).json({message:'Heartbeat failed.'});}
});

router.post('/session/:sessionId/force-submit', requireAdmin, async (req,res)=>{
  try {
    const session=await QuizSession.findById(req.params.sessionId); if(!session) return res.status(404).json({message:'Session not found.'});
    if(session.submitted) return res.status(409).json({message:'Session already submitted.'});
    const quiz=await Quiz.findById(session.quiz); if(!quiz) return res.status(404).json({message:'Quiz not found.'});
    const answers=Array.isArray(session.answers)?session.answers:[]; let score=0; quiz.questions.forEach((q,i)=>{if(answers[i]===q.answer)score++;});
    const attempt=await Attempt.create({quiz:quiz._id,player:session.player,playerName:session.playerName,answers,score,total:quiz.questions.length,percentage:quiz.questions.length?Math.round(score/quiz.questions.length*10000)/100:0,violations:session.violations||0,violationReasons:session.violationReasons||[],status:'auto-submitted'});
    session.submitted=true; session.submittedAt=new Date(); await session.save(); res.json({ok:true,attemptId:attempt._id});
  } catch(e){console.error(e);res.status(400).json({message:'Could not force submit participant.'});}
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
      .select('_id title subject topic time maxViolations examMode liveStatus liveLaunchAt liveJoinOpenAt liveJoinCloseAt liveStartedAt liveEndsAt showLiveScore showLeaderboard questions.question questions.options');
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
    const launchAt=new Date();
    const joinOpenAfter=Math.max(0, Math.min(180, Number(req.body.liveJoinOpenAfter || 0)));
    const joinCloseAfter=Math.max(0, Math.min(180, Number(req.body.liveJoinCloseAfter || 0)));
    const startAfter=Math.max(0, Math.min(180, Number(req.body.liveStartAfter || 0)));
    const closeAfter=Math.max(1, Math.min(360, Number(req.body.liveCloseAfter || duration)));
    if (joinCloseAfter && joinCloseAfter < joinOpenAfter) return res.status(400).json({message:'Join close time must be after join open time.'});
    if (startAfter && joinCloseAfter && startAfter < joinCloseAfter) return res.status(400).json({message:'Quiz start time must be at or after join close time.'});
    if (closeAfter <= startAfter) return res.status(400).json({message:'Live close time must be after quiz start time.'});
    const startAt=new Date(launchAt.getTime()+startAfter*60000);
    const endsAt=new Date(launchAt.getTime()+closeAfter*60000);
    const joinOpenAt=joinOpenAfter ? new Date(launchAt.getTime()+joinOpenAfter*60000) : launchAt;
    const joinCloseAt=joinCloseAfter ? new Date(launchAt.getTime()+joinCloseAfter*60000) : null;
    const quiz=await Quiz.create({
      title,subject,topic,time:duration,liveDuration:duration,maxViolations,examMode:true,
      isPublished:false,liveStatus:'live',liveLaunchAt:launchAt,liveStartedAt:startAt,liveEndsAt:endsAt,
      liveJoinOpenAt:joinOpenAt,liveJoinCloseAt:joinCloseAt,liveJoinOpenAfter:joinOpenAfter,liveJoinCloseAfter:joinCloseAfter,liveStartAfter:startAfter,liveCloseAfter:closeAfter,
      scheduledStartAt:startAt,
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
    const launchAt=new Date();
    const joinOpenAfter=Math.max(0, Math.min(180, Number(req.body.liveJoinOpenAfter ?? quiz.liveJoinOpenAfter ?? 0)));
    const joinCloseAfter=Math.max(0, Math.min(180, Number(req.body.liveJoinCloseAfter ?? quiz.liveJoinCloseAfter ?? 0)));
    const startAfter=Math.max(0, Math.min(180, Number(req.body.liveStartAfter ?? quiz.liveStartAfter ?? 0)));
    const closeAfter=Math.max(1, Math.min(360, Number(req.body.liveCloseAfter ?? quiz.liveCloseAfter ?? minutes)));
    if (joinCloseAfter && joinCloseAfter < joinOpenAfter) return res.status(400).json({message:'Join close time must be after join open time.'});
    if (startAfter && joinCloseAfter && startAfter < joinCloseAfter) return res.status(400).json({message:'Quiz start time must be at or after join close time.'});
    if (closeAfter <= startAfter) return res.status(400).json({message:'Live close time must be after quiz start time.'});
    const startAt=new Date(launchAt.getTime()+startAfter*60000);
    const endsAt=new Date(launchAt.getTime()+closeAfter*60000);
    const joinOpenAt=joinOpenAfter ? new Date(launchAt.getTime()+joinOpenAfter*60000) : launchAt;
    const joinCloseAt=joinCloseAfter ? new Date(launchAt.getTime()+joinCloseAfter*60000) : null;
    quiz.liveDuration=minutes; quiz.time=minutes; quiz.liveStatus='live'; quiz.liveLaunchAt=launchAt; quiz.liveStartedAt=startAt; quiz.liveEndsAt=endsAt; quiz.liveJoinOpenAt=joinOpenAt; quiz.liveJoinCloseAt=joinCloseAt; quiz.liveJoinOpenAfter=joinOpenAfter; quiz.liveJoinCloseAfter=joinCloseAfter; quiz.liveStartAfter=startAfter; quiz.liveCloseAfter=closeAfter; quiz.scheduledStartAt=startAt;
    quiz.showLiveScore=req.body.showLiveScore !== false; quiz.showLeaderboard=req.body.showLeaderboard !== false;
    await quiz.save(); res.json({quiz});
  } catch(e){res.status(400).json({message:e.message||'Could not start live quiz.'});}
});

router.post('/:id/end', requireAdmin, async (req,res)=>{
  try { const quiz=await Quiz.findById(req.params.id); if(!quiz)return res.status(404).json({message:'Quiz not found.'}); const forced={...quiz.toObject(), liveEndsAt:new Date(0), liveStatus:'live'}; await finalizeExpiredLiveQuiz(forced); quiz.liveStatus='ended'; quiz.liveEndsAt=new Date(); await quiz.save(); res.json({quiz}); }
  catch(e){res.status(400).json({message:'Could not end live quiz.'});}
});

router.get('/:id/admin-board', requireAdmin, async (req,res)=>{
  try {
    const quiz=await Quiz.findById(req.params.id).select('_id title subject topic liveStatus liveStartedAt liveEndsAt showLiveScore showLeaderboard questions.answer');
    if(!quiz)return res.status(404).json({message:'Quiz not found.'});
    const sessions=await QuizSession.find({quiz:quiz._id}).select('_id playerName answers submitted startedAt joinedAt lastSeenAt');
    const rows=sessions.map(s=>{let score=0; quiz.questions.forEach((q,i)=>{if(s.answers?.[i]===q.answer)score++;}); return {sessionId:s._id,playerName:s.playerName,score,total:quiz.questions.length,answered:(s.answers||[]).filter(a=>a>=0).length,submitted:s.submitted,joinedAt:s.joinedAt,lastSeenAt:s.lastSeenAt};}).sort((a,b)=>b.score-a.score||a.answered-b.answered);
    res.json({quiz,participants:rows.length,active:rows.filter(x=>!x.submitted).length,submitted:rows.filter(x=>x.submitted).length,leaderboard:rows.map((r,i)=>({...r,rank:i+1}))});
  }catch(e){res.status(400).json({message:'Could not load live board.'});}
});
module.exports=router;
