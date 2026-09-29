/* =========================================================
   TODO INSIGHTS — professional daily focus module
   Reads the server-authoritative Todo list and only derives
   presentation metrics. It does not write task data.
   ========================================================= */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const token = () => localStorage.getItem('groupQuizPlayerToken') || '';

  function parseDateKey(value) {
    const [y, m, d] = String(value).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  function isTargetComplete(task) {
    return (task.dailyLogs || []).filter(log => log.completed).length >= Number(task.durationDays || 1);
  }

  function getTodayLog(task, today) {
    return (task.dailyLogs || []).find(log => log.date === today) || { completed: false };
  }

  function daysUntil(endDate, today) {
    const end = parseDateKey(endDate);
    const now = parseDateKey(today);
    return Math.floor((end - now) / 86400000) + 1;
  }

  function set(id, value) {
    if ($(id)) $(id).textContent = String(value);
  }

  async function load() {
    try {
      const res = await fetch('/api/todos', { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) return;
      const data = await res.json();
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      const today = data.today;
      const active = tasks.filter(task => task.startDate <= today && task.endDate >= today && !isTargetComplete(task));
      const pending = active.filter(task => !getTodayLog(task, today).completed);
      const high = pending.filter(task => task.priority === 'high');
      const dueSoon = active.filter(task => daysUntil(task.endDate, today) <= 3);
      const completedGoals = tasks.filter(isTargetComplete).length;
      const applicableToday = tasks.filter(task => task.startDate <= today && task.endDate >= today);
      const totalToday = applicableToday.length;
      const doneToday = applicableToday.filter(task => Boolean(getTodayLog(task, today).completed)).length;
      const percent = totalToday ? Math.round((doneToday / totalToday) * 100) : 0;

      set('todoInsightPending', pending.length);
      set('todoInsightHigh', high.length);
      set('todoInsightDueSoon', dueSoon.length);
      set('todoInsightCompleted', completedGoals);
      set('todoInsightProgressText', `${percent}%`);
      if ($('todoInsightProgressBar')) $('todoInsightProgressBar').style.width = `${percent}%`;
    } catch (_) {
      // Insights are optional UI; core Todo remains usable if this request fails.
    }
  }

  $('todoFocusHighBtn')?.addEventListener('click', () => {
    const highFilter = document.querySelector('.todo-filter[data-filter="high"]');
    if (highFilter) highFilter.click();
    document.getElementById('todoList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  window.TodoInsights = { refresh: load };
  document.addEventListener('DOMContentLoaded', load);
})();
