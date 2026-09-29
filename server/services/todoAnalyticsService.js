'use strict';

function parseDateKey(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDate(dateString, days) {
  const d = parseDateKey(dateString);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return dateKey(d);
}

function isValidLog(log) {
  return log && /^\d{4}-\d{2}-\d{2}$/.test(String(log.date));
}

function completedDateSet(tasks) {
  const dates = new Set();
  for (const task of tasks) {
    for (const log of task.dailyLogs || []) {
      if (isValidLog(log) && Boolean(log.completed)) dates.add(log.date);
    }
  }
  return dates;
}

function calcStreaks(tasks, today) {
  const dates = completedDateSet(tasks);
  let current = 0;
  let cursor = today;
  while (dates.has(cursor)) {
    current += 1;
    cursor = shiftDate(cursor, -1);
  }

  const sorted = [...dates].sort();
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const date of sorted) {
    if (previous && shiftDate(previous, 1) === date) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  return { currentStreak: current, longestStreak: longest };
}

function windowReport(tasks, today, days) {
  const start = shiftDate(today, -(days - 1));
  let completedTaskDays = 0;
  let possibleTaskDays = 0;
  const daily = [];

  for (let i = 0; i < days; i += 1) {
    const date = shiftDate(start, i);
    let applicable = 0;
    let completed = 0;
    for (const task of tasks) {
      if (date < task.startDate || date > task.endDate) continue;
      applicable += 1;
      const log = (task.dailyLogs || []).find(item => item.date === date);
      if (log?.completed) completed += 1;
    }
    possibleTaskDays += applicable;
    completedTaskDays += completed;
    daily.push({ date, completed, applicable, percent: applicable ? Math.round((completed / applicable) * 100) : 0 });
  }

  return {
    days,
    start,
    end: today,
    completedTaskDays,
    possibleTaskDays,
    completionPercent: possibleTaskDays ? Math.round((completedTaskDays / possibleTaskDays) * 100) : 0,
    daily
  };
}

function buildDashboard(tasks, today) {
  const active = tasks.filter(task => !task.archived && task.endDate >= today && task.startDate <= today && !isTargetComplete(task));
  const doneToday = tasks.filter(task => (task.dailyLogs || []).some(log => log.date === today && log.completed)).length;
  const activeTaskDays = active.length;
  const todayPercent = activeTaskDays ? Math.round((doneToday / activeTaskDays) * 100) : 0;
  const remaining = active.reduce((sum, task) => {
    const end = parseDateKey(task.endDate);
    const now = parseDateKey(today);
    return sum + Math.max(0, Math.floor((end - now) / 86400000) + 1);
  }, 0);
  const streaks = calcStreaks(tasks, today);
  return {
    today,
    totalTasks: tasks.length,
    activeTasks: active.length,
    completedToday: doneToday,
    todayPercent,
    remainingTaskDays: remaining,
    currentStreak: streaks.currentStreak,
    longestStreak: streaks.longestStreak,
    week: windowReport(tasks, today, 7),
    month: windowReport(tasks, today, 30)
  };
}

function isTargetComplete(task) {
  return (task.dailyLogs || []).filter(log => log.completed).length >= Number(task.durationDays || 1);
}

module.exports = { buildDashboard, windowReport, calcStreaks };
