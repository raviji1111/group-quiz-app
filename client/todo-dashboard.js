/* Smart Todo dashboard module. Data comes from the server analytics API. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  async function load() {
    const token = localStorage.getItem('groupQuizPlayerToken') || '';
    const res = await fetch('/api/todos/analytics/dashboard', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    const d = data.dashboard || {};
    const set = (id, value) => { if ($(id)) $(id).textContent = value; };
    set('todoCurrentStreak', `${d.currentStreak || 0} day${d.currentStreak === 1 ? '' : 's'}`);
    set('todoLongestStreak', `${d.longestStreak || 0} day${d.longestStreak === 1 ? '' : 's'}`);
    set('todoWeekRate', `${d.week?.completionPercent || 0}%`);
    set('todoMonthRate', `${d.month?.completionPercent || 0}%`);
    set('todoRemainingTaskDays', String(d.remainingTaskDays || 0));
  }
  window.TodoDashboard = { refresh: load };
  document.addEventListener('DOMContentLoaded', load);
})();
