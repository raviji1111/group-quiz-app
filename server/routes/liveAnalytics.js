const express = require('express');
const Quiz = require('../models/Quiz');
const LiveAuditEvent = require('../models/LiveAuditEvent');
const { requireAdmin } = require('../middleware/auth');
const { rateLimit, requireObjectId } = require('../middleware/liveSecurity');
const { buildLiveAnalytics } = require('../services/liveAnalyticsService');

const router = express.Router();
router.use(requireAdmin, rateLimit({ max: 90 }));

router.get('/:id', requireObjectId('id'), async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id).select('+questions.answer');
    if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
    res.json({ quiz: { id: quiz._id, title: quiz.title, status: quiz.liveStatus }, ...(await buildLiveAnalytics(quiz)) });
  } catch (error) {
    console.error('LIVE analytics failed:', error.message);
    res.status(500).json({ message: 'Could not build LIVE analytics.' });
  }
});

router.get('/:id/audit', requireObjectId('id'), async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
    const events = await LiveAuditEvent.find({ quiz: req.params.id }).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ events });
  } catch (error) {
    res.status(500).json({ message: 'Could not load audit history.' });
  }
});

module.exports = router;

