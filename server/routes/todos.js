const express = require('express');
const TodoTask = require('../models/TodoTask');
const { requirePlayer } = require('../middleware/playerAuth');

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DURATION_TYPES = new Set(['day', 'week', 'month', 'year', 'custom']);
const PRIORITIES = new Set(['low', 'medium', 'high']);
const TODO_TIMEZONE = process.env.TODO_TIMEZONE || 'Asia/Kolkata';

function todayInTodoTimezone() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TODO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function cleanDate(value) {
  const date = String(value || '').trim();
  return DATE_RE.test(date) ? date : '';
}

function parseDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(result.getTime()) ? null : result;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = parseDate(dateString);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return formatDate(date);
}

function addDuration(startDate, durationType, customDays) {
  const date = parseDate(startDate);
  if (durationType === 'week') {
    date.setUTCDate(date.getUTCDate() + 6);
  } else if (durationType === 'month') {
    // One calendar month, inclusive of the start day.
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
  } else if (durationType === 'year') {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  } else if (durationType === 'custom') {
    date.setUTCDate(date.getUTCDate() + Math.max(0, Number(customDays || 1) - 1));
  }
  return formatDate(date);
}

function durationDaysBetween(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

function normalizeTask(task) {
  const obj = task.toObject ? task.toObject() : task;
  return {
    id: String(obj._id),
    title: obj.title,
    notes: obj.notes || '',
    priority: obj.priority || 'medium',
    category: obj.category || 'Other',
    durationType: obj.durationType || 'custom',
    durationDays: obj.durationDays,
    startDate: obj.startDate,
    endDate: obj.endDate,
    dailyLogs: Array.isArray(obj.dailyLogs) ? obj.dailyLogs.map(log => ({
      date: log.date,
      progress: Number(log.progress || 0),
      note: log.note || '',
      completed: Boolean(log.completed),
      updatedAt: log.updatedAt
    })) : [],
    archived: Boolean(obj.archived),
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
}

function taskForPlayer(id, playerId) {
  return TodoTask.findOne({ _id: id, player: playerId });
}

router.get('/', requirePlayer, async (req, res) => {
  try {
    const tasks = await TodoTask.find({ player: req.player.id, archived: false }).sort({ createdAt: -1 }).lean();
    res.json({ today: todayInTodoTimezone(), timezone: TODO_TIMEZONE, tasks: tasks.map(normalizeTask) });
  } catch (error) {
    console.error('Todo list error:', error);
    res.status(500).json({ message: 'Could not load Todo tasks.' });
  }
});

router.post('/', requirePlayer, async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title || title.length > 120) return res.status(400).json({ message: 'Task title is required (max 120 characters).' });

    const priority = String(req.body.priority || 'medium');
    if (!PRIORITIES.has(priority)) return res.status(400).json({ message: 'Invalid priority.' });

    const durationType = String(req.body.durationType || 'day');
    if (!DURATION_TYPES.has(durationType)) return res.status(400).json({ message: 'Invalid duration.' });

    const serverToday = todayInTodoTimezone();
    const requestedStartDate = cleanDate(req.body.startDate);
    if (requestedStartDate && requestedStartDate !== serverToday) {
      return res.status(400).json({ message: 'A new goal must start today. Past or future start dates are not allowed.' });
    }
    const startDate = serverToday;
    const customDays = Number(req.body.customDays || 1);
    if (durationType === 'custom' && (!Number.isInteger(customDays) || customDays < 1 || customDays > 3650)) {
      return res.status(400).json({ message: 'Custom duration must be between 1 and 3650 days.' });
    }

    const endDate = addDuration(startDate, durationType, customDays);
    const durationDays = durationType === 'day' ? 1 : durationType === 'week' ? 7 : durationType === 'month' ? durationDaysBetween(startDate, endDate) : durationType === 'year' ? durationDaysBetween(startDate, endDate) : customDays;

    const task = await TodoTask.create({
      player: req.player.id,
      title,
      notes: String(req.body.notes || '').trim().slice(0, 500),
      priority,
      category: String(req.body.category || 'Other').trim().slice(0, 40) || 'Other',
      durationType,
      durationDays,
      startDate,
      endDate,
      dailyLogs: []
    });

    res.status(201).json({ task: normalizeTask(task) });
  } catch (error) {
    console.error('Todo create error:', error);
    res.status(400).json({ message: 'Could not create Todo task.' });
  }
});

router.patch('/:id', requirePlayer, async (req, res) => {
  try {
    const task = await taskForPlayer(req.params.id, req.player.id);
    if (!task) return res.status(404).json({ message: 'Todo task not found.' });

    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title || title.length > 120) return res.status(400).json({ message: 'Task title is required (max 120 characters).' });
      task.title = title;
    }
    if (req.body.notes !== undefined) task.notes = String(req.body.notes || '').trim().slice(0, 500);
    if (req.body.priority !== undefined && PRIORITIES.has(String(req.body.priority))) task.priority = String(req.body.priority);
    if (req.body.category !== undefined) task.category = String(req.body.category || 'Other').trim().slice(0, 40) || 'Other';

    await task.save();
    res.json({ task: normalizeTask(task) });
  } catch (error) {
    console.error('Todo update error:', error);
    res.status(400).json({ message: 'Could not update Todo task.' });
  }
});

router.patch('/:id/daily', requirePlayer, async (req, res) => {
  try {
    const task = await taskForPlayer(req.params.id, req.player.id);
    if (!task) return res.status(404).json({ message: 'Todo task not found.' });

    const date = cleanDate(req.body.date);
    if (!date) return res.status(400).json({ message: 'A valid day is required.' });
    const serverToday = todayInTodoTimezone();
    if (date !== serverToday) {
      return res.status(400).json({ message: "Only today's progress can be saved. Previous and future days are locked." });
    }
    if (date < task.startDate || date > task.endDate) return res.status(400).json({ message: 'Today is outside this task target period.' });

    const rawProgress = Number(req.body.progress);
    if (!Number.isFinite(rawProgress) || !Number.isInteger(rawProgress) || rawProgress < 0 || rawProgress > 100) {
      return res.status(400).json({ message: 'Daily progress must be a whole number from 0 to 100.' });
    }
    const progress = rawProgress;
    const note = String(req.body.note || '').trim().slice(0, 500);
    const existing = task.dailyLogs.find(log => log.date === date);
    const targetAlreadyComplete = task.dailyLogs.filter(log => log.completed).length >= task.durationDays;
    if (targetAlreadyComplete) return res.status(400).json({ message: 'This goal is already completed and is locked.' });
    const completed = progress >= 100;
    if (existing) {
      existing.progress = progress;
      existing.note = note;
      existing.completed = completed;
      existing.updatedAt = new Date();
    } else {
      task.dailyLogs.push({ date, progress, note, completed, updatedAt: new Date() });
    }

    await task.save();
    res.json({ task: normalizeTask(task) });
  } catch (error) {
    console.error('Todo daily update error:', error);
    res.status(400).json({ message: 'Could not save daily progress.' });
  }
});

router.delete('/:id', requirePlayer, async (req, res) => {
  try {
    const result = await TodoTask.deleteOne({ _id: req.params.id, player: req.player.id });
    if (!result.deletedCount) return res.status(404).json({ message: 'Todo task not found.' });
    res.json({ ok: true });
  } catch (error) {
    console.error('Todo delete error:', error);
    res.status(400).json({ message: 'Could not delete Todo task.' });
  }
});

router.delete('/:id/daily/:date', requirePlayer, async (req, res) => {
  try {
    const date = cleanDate(req.params.date);
    const task = await taskForPlayer(req.params.id, req.player.id);
    if (!task) return res.status(404).json({ message: 'Todo task not found.' });
    if (date !== todayInTodoTimezone()) return res.status(400).json({ message: "Only today's progress can be cleared." });
    task.dailyLogs = task.dailyLogs.filter(log => log.date !== date);
    await task.save();
    res.json({ task: normalizeTask(task) });
  } catch (error) {
    console.error('Todo daily delete error:', error);
    res.status(400).json({ message: 'Could not clear daily progress.' });
  }
});

module.exports = router;
