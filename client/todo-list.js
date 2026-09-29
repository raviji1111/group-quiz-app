/* =========================================================
   TODO LIST — database-backed daily task tracker
   - Shows only today's working state (no long date strip).
   - Each task can be marked Done / Not Done for today.
   - Only today's date can be written; server remains authoritative.
   ========================================================= */
(() => {
  'use strict';

  const API = '/api';
  let activeFilter = 'all';
  let editingId = null;
  let tasks = [];
  let today = '';
  let todoTimezone = 'Asia/Kolkata';

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

  function parseDateKey(value) {
    const [y, m, d] = String(value).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDate(value) {
    if (!value) return '';
    const d = parseDateKey(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  function getLog(task, date = today) {
    return (task.dailyLogs || []).find(log => log.date === date) || {
      date, progress: 0, completed: false, note: ''
    };
  }

  function isTargetComplete(task) {
    return (task.dailyLogs || []).filter(log => log.completed).length >= Number(task.durationDays || 1);
  }

  function isExpired(task) { return today > task.endDate && !isTargetComplete(task); }
  function isBeforeStart(task) { return today < task.startDate; }

  function daysLeft(task) {
    if (!task.endDate || today > task.endDate) return 0;
    const end = parseDateKey(task.endDate);
    const now = parseDateKey(today);
    return Math.max(0, Math.floor((end - now) / 86400000) + 1);
  }

  function durationLabel(task) {
    const n = Number(task.durationDays || 1);
    if (task.durationType === 'day') return '1 day';
    if (task.durationType === 'week') return '7 days';
    if (task.durationType === 'month') return `${n} days`;
    if (task.durationType === 'year') return `${n} days`;
    return `${n} day${n === 1 ? '' : 's'}`;
  }

  function setMessage(message, type = 'info') {
    const el = $('todoMessage');
    if (!el) return;
    el.textContent = message || '';
    el.className = `todo-message ${message ? `is-${type}` : ''}`;
    if (message) setTimeout(() => { if (el.textContent === message) el.textContent = ''; }, 3000);
  }

  function renderTask(task) {
    const log = getLog(task);
    const doneToday = Boolean(log.completed);
    const targetComplete = isTargetComplete(task);
    const expired = isExpired(task);
    const beforeStart = isBeforeStart(task);
    const locked = beforeStart || expired || targetComplete;
    const remaining = daysLeft(task);
    const dailyNote = log.note || '';
    const statusText = targetComplete ? 'Target completed' : expired ? 'Target ended' : `${remaining} day${remaining === 1 ? '' : 's'} left`;

    const item = document.createElement('article');
    item.className = `todo-item todo-goal${targetComplete ? ' is-complete' : ''}${expired ? ' is-expired' : ''}${doneToday ? ' done-today' : ''}`;
    item.dataset.id = task.id;
    item.innerHTML = `
      <div class="todo-goal-top">
        <div class="todo-task-main">
          <label class="todo-done-toggle" title="Mark this task done for today">
            <input class="todo-done-check" type="checkbox" ${doneToday ? 'checked' : ''} ${locked ? 'disabled' : ''}>
            <span class="todo-check-box">${doneToday ? '✓' : ''}</span>
          </label>
          <div class="todo-content">
            <div class="todo-title-row">
              <h3>${escapeHtml(task.title)}</h3>
              <span class="todo-priority ${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span>
            </div>
            ${task.notes ? `<p>${escapeHtml(task.notes)}</p>` : ''}
            <div class="todo-meta">
              <span class="todo-category">${escapeHtml(task.category || 'Other')}</span>
              <span>🎯 ${escapeHtml(durationLabel(task))}</span>
              <span class="todo-days-left">${escapeHtml(statusText)}</span>
            </div>
          </div>
        </div>
        <div class="todo-actions">
          <button type="button" class="todo-save-day" ${locked ? 'disabled' : ''}>${doneToday ? '✓ Done — Save' : 'Save Not Done'}</button>
          <button type="button" class="todo-edit">Edit</button>
          <button type="button" class="todo-delete">Delete</button>
        </div>
      </div>
      <div class="todo-today-row">
        <div class="todo-today-status ${doneToday ? 'is-done' : ''}">
          <strong>${doneToday ? 'DONE TODAY' : 'NOT DONE TODAY'}</strong>
          <span>${doneToday ? 'This task is marked complete for today.' : 'Mark Done when you finish this task today.'}</span>
        </div>
        <input class="todo-day-note" type="text" maxlength="500" value="${escapeHtml(dailyNote)}" placeholder="Today's note (optional)" ${locked ? 'disabled' : ''}>
      </div>`;

    const check = item.querySelector('.todo-done-check');
    const box = item.querySelector('.todo-check-box');
    const saveBtn = item.querySelector('.todo-save-day');
    const status = item.querySelector('.todo-today-status');
    const note = item.querySelector('.todo-day-note');

    const syncVisual = () => {
      const done = check.checked;
      box.textContent = done ? '✓' : '';
      status.classList.toggle('is-done', done);
      status.querySelector('strong').textContent = done ? 'DONE TODAY' : 'NOT DONE TODAY';
      status.querySelector('span').textContent = done ? 'This task is marked complete for today.' : 'Mark Done when you finish this task today.';
      saveBtn.textContent = done ? '✓ Done — Save' : 'Save Not Done';
    };

    check.addEventListener('change', syncVisual);
    saveBtn.addEventListener('click', () => saveToday(task.id, check.checked, note.value));
    item.querySelector('.todo-edit').addEventListener('click', () => edit(task.id));
    item.querySelector('.todo-delete').addEventListener('click', () => remove(task.id));
    return item;
  }

  function render() {
    const list = $('todoList'), empty = $('todoEmpty');
    if (!list || !empty) return;

    const search = ($('todoSearch')?.value || '').trim().toLowerCase();
    let visible = tasks.filter(task => {
      const complete = isTargetComplete(task);
      const doneToday = getLog(task).completed;
      if (activeFilter === 'pending' && complete) return false;
      if (activeFilter === 'completed' && !complete) return false;
      if (activeFilter === 'today-done' && !doneToday) return false;
      if (activeFilter === 'high' && task.priority !== 'high') return false;
      if (activeFilter === 'expired' && !isExpired(task)) return false;
      if (search && !`${task.title} ${task.notes || ''} ${task.category || ''}`.toLowerCase().includes(search)) return false;
      return true;
    });

    visible.sort((a, b) => {
      const ad = getLog(a).completed, bd = getLog(b).completed;
      if (ad !== bd) return ad ? 1 : -1;
      if (a.endDate !== b.endDate) return String(a.endDate).localeCompare(String(b.endDate));
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });

    list.innerHTML = '';
    visible.forEach(task => list.appendChild(renderTask(task)));
    empty.classList.toggle('hidden', visible.length !== 0);
    updateDashboard();
  }

  function updateDashboard() {
    const total = tasks.length;
    const doneToday = tasks.filter(task => getLog(task).completed).length;
    const active = tasks.filter(task => !isTargetComplete(task) && !isExpired(task)).length;
    const todayPercent = total ? Math.round((doneToday / total) * 100) : 0;
    const dayValues = tasks.filter(task => !isTargetComplete(task) && !isExpired(task)).map(daysLeft);
    const minDaysLeft = dayValues.length ? Math.min(...dayValues) : 0;

    if ($('todoTotal')) $('todoTotal').textContent = total;
    if ($('todoPending')) $('todoPending').textContent = active;
    if ($('todoCompleted')) $('todoCompleted').textContent = `${doneToday}/${total}`;
    if ($('todoProgress')) $('todoProgress').textContent = `${todayPercent}%`;
    if ($('todoProgressBar')) $('todoProgressBar').style.width = `${todayPercent}%`;
    if ($('todoTodayDate')) $('todoTodayDate').textContent = formatDate(today);
    if ($('todoDaysLeft')) $('todoDaysLeft').textContent = minDaysLeft ? `${minDaysLeft} day${minDaysLeft === 1 ? '' : 's'}` : '—';
    if ($('todoDoneToday')) $('todoDoneToday').textContent = `${doneToday}/${total}`;
  }

  function resetForm() {
    $('todoForm')?.reset();
    if ($('todoPriority')) $('todoPriority').value = 'medium';
    if ($('todoCategory')) $('todoCategory').value = 'Study';
    if ($('todoDuration')) { $('todoDuration').value = 'day'; $('todoDuration').disabled = false; }
    if ($('todoCustomDays')) $('todoCustomDays').value = 7;
    $('todoCustomWrap')?.classList.add('hidden');
    editingId = null;
    if ($('todoAddBtn')) $('todoAddBtn').textContent = '＋ Add Task';
  }

  function formPayload() {
    return {
      title: ($('todoTitle')?.value || '').trim(),
      notes: ($('todoNotes')?.value || '').trim(),
      priority: $('todoPriority')?.value || 'medium',
      category: $('todoCategory')?.value || 'Other',
      durationType: $('todoDuration')?.value === 'custom90' ? 'custom' : ($('todoDuration')?.value || 'day'),
      customDays: $('todoDuration')?.value === 'custom90' ? 90 : Number($('todoCustomDays')?.value || 1)
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
        setMessage('Task created and saved to database.', 'success');
      }
      resetForm();
      render();
    } catch (error) { setMessage(error.message, 'error'); }
    finally { if (btn) btn.disabled = false; }
  }

  async function saveToday(id, done, note) {
    try {
      const result = await api(`/todos/${encodeURIComponent(id)}/daily`, {
        method: 'PATCH',
        body: JSON.stringify({ date: today, progress: done ? 100 : 0, note })
      });
      tasks = tasks.map(task => task.id === id ? result.task : task);
      render();
      setMessage(done ? 'Today marked DONE and saved.' : 'Today marked NOT DONE and saved.', 'success');
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
    $('todoDuration').disabled = true;
    $('todoCustomDays').value = task.durationDays || 7;
    $('todoCustomWrap')?.classList.toggle('hidden', task.durationType !== 'custom');
    $('todoAddBtn').textContent = '✓ Update Task';
    $('todoTitle').focus();
    $('todoForm').scrollIntoView({ behavior:'smooth', block:'center' });
  }

  async function remove(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    if (!confirm(`Delete "${task.title}" and its saved daily history?`)) return;
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
      today = result.today || today;
      todoTimezone = result.timezone || todoTimezone;
      tasks = Array.isArray(result.tasks) ? result.tasks : [];
      render();
    } catch (error) { setMessage(error.message, 'error'); }
  }

  function bind() {
    $('todoForm')?.addEventListener('submit', addOrUpdate);
    $('todoSearch')?.addEventListener('input', render);
    $('todoDuration')?.addEventListener('change', e => $('todoCustomWrap')?.classList.toggle('hidden', !['custom'].includes(e.target.value)));
    document.querySelectorAll('.todo-filter').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.todo-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter || 'all';
      render();
    }));
    $('todoRefresh')?.addEventListener('click', loadTasks);
    window.TodoList = { refresh: loadTasks };
    loadTasks();

    // Refresh only the current-day state. The server decides what "today" is.
    setInterval(loadTasks, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadTasks(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
