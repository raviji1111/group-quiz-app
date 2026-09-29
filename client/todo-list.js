/* =========================================================
   TODO LIST — database + daily goal tracking module
   Every task and every day's progress is stored in MongoDB.
   ========================================================= */
(() => {
  'use strict';

  const API = '/api';
  let activeFilter = 'all';
  let editingId = null;
  let tasks = [];
  let today = localDateKey();

  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[c]));

  function token() { return localStorage.getItem('groupQuizPlayerToken') || ''; }

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;
    const response = await fetch(`${API}${path}`, { ...options, headers });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      if (response.status === 401) window.location.replace('index.html');
      throw new Error(data.message || 'Request failed.');
    }
    return data;
  }

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDateKey(value) {
    const [y, m, d] = String(value).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(value, amount) {
    const d = parseDateKey(value);
    d.setDate(d.getDate() + amount);
    return localDateKey(d);
  }

  function formatDate(value, options = { day:'numeric', month:'short', year:'numeric' }) {
    if (!value) return '';
    const d = parseDateKey(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, options);
  }

  function getLog(task, date = today) {
    return (task.dailyLogs || []).find(log => log.date === date) || { date, progress: 0, completed: false, note: '' };
  }

  function completedDays(task) {
    return (task.dailyLogs || []).filter(log => log.completed).length;
  }

  function targetProgress(task) {
    return task.durationDays ? Math.round((completedDays(task) / task.durationDays) * 100) : 0;
  }

  function isTargetComplete(task) { return completedDays(task) >= task.durationDays; }
  function isExpired(task) { return today > task.endDate && !isTargetComplete(task); }
  function isBeforeStart(task) { return today < task.startDate; }

  function durationLabel(task) {
    const n = Number(task.durationDays || 1);
    if (task.durationType === 'day') return '1 day';
    if (task.durationType === 'week') return '1 week';
    if (task.durationType === 'month') return '1 month';
    if (task.durationType === 'year') return '1 year';
    return `${n} day${n === 1 ? '' : 's'}`;
  }

  function daysLeft(task) {
    if (today > task.endDate) return 0;
    return Math.max(0, Math.floor((parseDateKey(task.endDate) - parseDateKey(today)) / 86400000) + 1);
  }

  function setMessage(message, type = 'info') {
    const el = $('todoMessage');
    if (!el) return;
    el.textContent = message || '';
    el.className = `todo-message ${message ? `is-${type}` : ''}`;
    if (message) setTimeout(() => { if (el.textContent === message) el.textContent = ''; }, 3500);
  }

  function renderHistory(task) {
    const days = [];
    for (let i = 0; i < task.durationDays; i++) {
      const date = addDays(task.startDate, i);
      const log = getLog(task, date);
      days.push(`<span class="todo-day ${log.completed ? 'done' : ''} ${date === today ? 'today' : ''}" title="${escapeHtml(formatDate(date))}: ${Number(log.progress || 0)}%">${date.slice(8,10)}</span>`);
    }
    return `<div class="todo-day-track">${days.join('')}</div>`;
  }

  function render() {
    const list = $('todoList'), empty = $('todoEmpty');
    if (!list || !empty) return;

    const search = ($('todoSearch')?.value || '').trim().toLowerCase();
    let visible = tasks.filter(task => {
      const done = isTargetComplete(task);
      if (activeFilter === 'pending' && done) return false;
      if (activeFilter === 'completed' && !done) return false;
      if (activeFilter === 'high' && task.priority !== 'high') return false;
      if (activeFilter === 'expired' && !isExpired(task)) return false;
      if (search && !`${task.title} ${task.notes || ''} ${task.category || ''}`.toLowerCase().includes(search)) return false;
      return true;
    });

    visible.sort((a, b) => {
      const ad = isTargetComplete(a), bd = isTargetComplete(b);
      if (ad !== bd) return ad ? 1 : -1;
      if (a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate);
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });

    list.innerHTML = '';
    empty.classList.toggle('hidden', visible.length !== 0);

    visible.forEach(task => {
      const log = getLog(task);
      const progress = Math.max(0, Math.min(100, Number(log.progress || 0)));
      const overall = targetProgress(task);
      const complete = isTargetComplete(task);
      const expired = isExpired(task);
      const beforeStart = isBeforeStart(task);
      const item = document.createElement('article');
      item.className = `todo-item todo-goal${complete ? ' is-complete' : ''}${expired ? ' is-expired' : ''}`;
      item.dataset.id = task.id;

      item.innerHTML = `
        <div class="todo-goal-top">
          <div class="todo-check-wrap">
            <div class="todo-goal-icon">${complete ? '✓' : '○'}</div>
            <div class="todo-content">
              <div class="todo-title-row"><h3>${escapeHtml(task.title)}</h3><span class="todo-priority ${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span></div>
              ${task.notes ? `<p>${escapeHtml(task.notes)}</p>` : ''}
              <div class="todo-meta"><span class="todo-category">${escapeHtml(task.category || 'Other')}</span><span>🎯 ${escapeHtml(durationLabel(task))}</span><span>${escapeHtml(formatDate(task.startDate, {day:'numeric',month:'short'}))} → ${escapeHtml(formatDate(task.endDate, {day:'numeric',month:'short',year:'numeric'}))}</span></div>
            </div>
          </div>
          <div class="todo-actions"><button type="button" class="todo-edit">Edit</button><button type="button" class="todo-delete">Delete</button></div>
        </div>

        <div class="todo-goal-progress">
          <div class="todo-progress-head"><strong>${completedDays(task)} / ${task.durationDays} days completed</strong><span>${overall}% target progress</span></div>
          <div class="todo-progress"><i style="width:${overall}%"></i></div>
          <div class="todo-day-caption"><span>Daily tracking</span><span>${beforeStart ? `Starts ${formatDate(task.startDate, {day:'numeric',month:'short'})}` : expired ? 'Target ended' : complete ? 'Target completed' : `${daysLeft(task)} day${daysLeft(task) === 1 ? '' : 's'} left`}</span></div>
          ${renderHistory(task)}
        </div>

        <div class="todo-today-card">
          <div class="todo-today-title"><span>Today · ${escapeHtml(formatDate(today))}</span><strong>${progress}%</strong></div>
          <div class="todo-today-controls">
            <input class="todo-day-range" type="range" min="0" max="100" step="5" value="${progress}" aria-label="Today's progress" ${beforeStart || expired || complete ? 'disabled' : ''}>
            <input class="todo-day-number" type="number" min="0" max="100" step="5" value="${progress}" aria-label="Today's progress percentage" ${beforeStart || expired || complete ? 'disabled' : ''}>
            <input class="todo-day-note" type="text" maxlength="500" value="${escapeHtml(log.note || '')}" placeholder="What did you complete today?" ${beforeStart || expired || complete ? 'disabled' : ''}>
            <button type="button" class="todo-save-day" ${beforeStart || expired || complete ? 'disabled' : ''}>${beforeStart ? 'Not started' : complete ? 'Goal complete' : expired ? 'Target ended' : 'Save today'}</button>
          </div>
          <small class="todo-day-help">Set today's progress. At 100%, this day is saved as completed. Your daily result stays in the database.</small>
        </div>`;

      const range = item.querySelector('.todo-day-range');
      const number = item.querySelector('.todo-day-number');
      const todayStrong = item.querySelector('.todo-today-title strong');
      const sync = value => {
        const n = Math.max(0, Math.min(100, Number(value) || 0));
        range.value = n; number.value = n; todayStrong.textContent = `${n}%`;
      };
      let autoSaveTimer;
      const queueAutoSave = () => {
        if (beforeStart || expired || complete) return;
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => saveDaily(task.id, Number(number.value || 0), item.querySelector('.todo-day-note').value, { silent: true }), 800);
      };
      range.addEventListener('input', e => { sync(e.target.value); queueAutoSave(); });
      number.addEventListener('input', e => { sync(e.target.value); queueAutoSave(); });
      item.querySelector('.todo-day-note').addEventListener('blur', queueAutoSave);
      item.querySelector('.todo-save-day').addEventListener('click', () => saveDaily(task.id, Number(number.value || 0), item.querySelector('.todo-day-note').value));
      item.querySelector('.todo-edit').addEventListener('click', () => edit(task.id));
      item.querySelector('.todo-delete').addEventListener('click', () => remove(task.id));
      list.appendChild(item);
    });

    updateStats();
  }

  function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(isTargetComplete).length;
    const pending = total - completed;
    const average = total ? Math.round(tasks.reduce((sum, task) => sum + targetProgress(task), 0) / total) : 0;
    if ($('todoTotal')) $('todoTotal').textContent = total;
    if ($('todoPending')) $('todoPending').textContent = pending;
    if ($('todoCompleted')) $('todoCompleted').textContent = completed;
    if ($('todoProgress')) $('todoProgress').textContent = `${average}%`;
    if ($('todoProgressBar')) $('todoProgressBar').style.width = `${average}%`;
  }

  function resetForm() {
    $('todoForm')?.reset();
    if ($('todoPriority')) $('todoPriority').value = 'medium';
    if ($('todoCategory')) $('todoCategory').value = 'Study';
    if ($('todoDuration')) $('todoDuration').value = 'day';
    if ($('todoStartDate')) $('todoStartDate').value = today;
    if ($('todoCustomDays')) $('todoCustomDays').value = 7;
    $('todoCustomWrap')?.classList.add('hidden');
    editingId = null;
    if ($('todoAddBtn')) $('todoAddBtn').textContent = '＋ Add Goal';
  }

  function formPayload() {
    return {
      title: ($('todoTitle')?.value || '').trim(),
      notes: ($('todoNotes')?.value || '').trim(),
      priority: $('todoPriority')?.value || 'medium',
      category: $('todoCategory')?.value || 'Other',
      durationType: $('todoDuration')?.value || 'day',
      customDays: Number($('todoCustomDays')?.value || 1),
      startDate: $('todoStartDate')?.value || today
    };
  }

  async function addOrUpdate(event) {
    event.preventDefault();
    const payload = formPayload();
    if (!payload.title) return;
    const btn = $('todoAddBtn');
    if (btn) { btn.disabled = true; btn.textContent = editingId ? 'Saving...' : 'Creating...'; }
    try {
      if (editingId) {
        const result = await api(`/todos/${encodeURIComponent(editingId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
        tasks = tasks.map(task => task.id === editingId ? result.task : task);
        setMessage('Task updated.', 'success');
      } else {
        const result = await api('/todos', { method: 'POST', body: JSON.stringify(payload) });
        tasks.unshift(result.task);
        setMessage('Goal created and saved to database.', 'success');
      }
      resetForm();
      render();
    } catch (error) { setMessage(error.message, 'error'); }
    finally { if (btn) btn.disabled = false; }
  }

  async function saveDaily(id, progress, note, options = {}) {
    try {
      const result = await api(`/todos/${encodeURIComponent(id)}/daily`, {
        method: 'PATCH', body: JSON.stringify({ date: today, progress, note })
      });
      tasks = tasks.map(task => task.id === id ? result.task : task);
      if (!options.silent) render();
      setMessage(options.silent ? 'Auto-saved today\'s progress.' : (progress >= 100 ? 'Today completed and saved.' : 'Today\'s progress saved.'), 'success');
    } catch (error) { setMessage(error.message, 'error'); }
  }

  function edit(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    editingId = id;
    $('todoTitle').value = task.title || '';
    $('todoNotes').value = task.notes || '';
    $('todoPriority').value = task.priority || 'medium';
    $('todoCategory').value = task.category || 'Other';
    $('todoDuration').value = task.durationType || 'custom';
    $('todoStartDate').value = task.startDate || today;
    $('todoCustomDays').value = task.durationDays || 7;
    $('todoCustomWrap')?.classList.toggle('hidden', task.durationType !== 'custom');
    $('todoAddBtn').textContent = '✓ Update Task';
    $('todoTitle').focus();
    $('todoForm').scrollIntoView({ behavior:'smooth', block:'center' });
  }

  async function remove(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    if (!confirm(`Delete "${task.title}" and its daily history?`)) return;
    try {
      await api(`/todos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      tasks = tasks.filter(t => t.id !== id);
      if (editingId === id) resetForm();
      render();
      setMessage('Task deleted.', 'success');
    } catch (error) { setMessage(error.message, 'error'); }
  }

  async function loadTasks() {
    try {
      const result = await api('/todos');
      tasks = Array.isArray(result.tasks) ? result.tasks : [];
      render();
    } catch (error) { setMessage(error.message, 'error'); }
  }

  function bind() {
    if ($('todoStartDate')) $('todoStartDate').value = today;
    $('todoForm')?.addEventListener('submit', addOrUpdate);
    $('todoSearch')?.addEventListener('input', render);
    $('todoDuration')?.addEventListener('change', e => $('todoCustomWrap')?.classList.toggle('hidden', e.target.value !== 'custom'));
    document.querySelectorAll('.todo-filter').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.todo-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter || 'all';
      render();
    }));
    $('todoRefresh')?.addEventListener('click', loadTasks);
    window.TodoList = { refresh: loadTasks };
    loadTasks();

    // Re-check the local calendar regularly. At midnight the UI moves to the new day
    // automatically; previously saved daily logs remain in MongoDB.
    setInterval(() => {
      const next = localDateKey();
      if (next !== today) { today = next; resetForm(); loadTasks(); }
    }, 30000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        const next = localDateKey();
        if (next !== today) today = next;
        loadTasks();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
