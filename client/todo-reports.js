/* Weekly/monthly Todo reporting module. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  function renderDaily(rows, target) {
    const el = $(target);
    if (!el) return;
    el.innerHTML = rows.map(row => `<div class="todo-report-row"><span>${row.date}</span><strong>${row.completed}/${row.applicable}</strong><b>${row.percent}%</b></div>`).join('');
  }
  async function load() {
    const token = localStorage.getItem('groupQuizPlayerToken') || '';
    const res = await fetch('/api/todos/analytics/reports', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    const set = (id, value) => { if ($(id)) $(id).textContent = value; };
    set('todoWeekSummary', `${data.weekly.completedTaskDays}/${data.weekly.possibleTaskDays} task-days • ${data.weekly.completionPercent}%`);
    set('todoMonthSummary', `${data.monthly.completedTaskDays}/${data.monthly.possibleTaskDays} task-days • ${data.monthly.completionPercent}%`);
    renderDaily(data.weekly.daily, 'todoWeekRows');
    renderDaily(data.monthly.daily, 'todoMonthRows');
    set('todoReportCurrentStreak', `${data.streak.current} days`);
    set('todoReportLongestStreak', `${data.streak.longest} days`);
  }
  window.TodoReports = { refresh: load };
  document.addEventListener('DOMContentLoaded', load);
})();
