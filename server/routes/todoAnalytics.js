'use strict';
const express = require('express');
const TodoTask = require('../models/TodoTask');
const { requirePlayer } = require('../middleware/playerAuth');
const { buildDashboard, windowReport } = require('../services/todoAnalyticsService');

const router = express.Router();
const TODO_TIMEZONE = process.env.TODO_TIMEZONE || 'Asia/Kolkata';
function todayInTodoTimezone() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TODO_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

router.get('/dashboard', requirePlayer, async (req, res) => {
  try {
    const today = todayInTodoTimezone();
    const tasks = await TodoTask.find({ player: req.player.id, archived: false }).lean();
    res.json({ dashboard: buildDashboard(tasks, today), timezone: TODO_TIMEZONE });
  } catch (error) {
    console.error('Todo dashboard error:', error);
    res.status(500).json({ message: 'Could not load Todo dashboard.' });
  }
});

router.get('/reports', requirePlayer, async (req, res) => {
  try {
    const today = todayInTodoTimezone();
    const tasks = await TodoTask.find({ player: req.player.id, archived: false }).lean();
    const dashboard = buildDashboard(tasks, today);
    res.json({
      today,
      timezone: TODO_TIMEZONE,
      weekly: windowReport(tasks, today, 7),
      monthly: windowReport(tasks, today, 30),
      streak: { current: dashboard.currentStreak, longest: dashboard.longestStreak }
    });
  } catch (error) {
    console.error('Todo reports error:', error);
    res.status(500).json({ message: 'Could not load Todo reports.' });
  }
});

module.exports = router;
