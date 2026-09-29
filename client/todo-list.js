/* =========================================================
   TODO LIST — dedicated feature module
   Personal tasks are stored locally per logged-in player.
   This module does not modify quiz/live data or API routes.
   ========================================================= */
(() => {
  'use strict';

  const KEY_PREFIX = 'groupQuizTodoV1:';
  let activeFilter = 'all';
  let editingId = null;

  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[c]));

  function currentUserKey() {
    try {
      const player = JSON.parse(localStorage.getItem('groupQuizPlayer') || 'null');
      const identity = player?.email || player?._id || player?.id || player?.name;
      return identity ? `${KEY_PREFIX}${String(identity).trim().toLowerCase()}` : null;
    } catch (_) { return null; }
  }

  function load() {
    const key = currentUserKey();
    if (!key) return [];
    try {
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(data) ? data : [];
    } catch (_) { return []; }
  }

  function save(tasks) {
    const key = currentUserKey();
    if (key) localStorage.setItem(key, JSON.stringify(tasks));
  }

  function formatDate(date) {
    if (!date) return '';
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });
  }

  function isOverdue(task) {
    if (!task.dueDate || task.completed) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    const due = new Date(`${task.dueDate}T00:00:00`);
    return due < today;
  }

  function render() {
    const list = $('todoList'), empty = $('todoEmpty');
    if (!list || !empty) return;

    const tasks = load();
    const search = ($('todoSearch')?.value || '').trim().toLowerCase();
    let visible = tasks.filter(task => {
      if (activeFilter === 'pending' && task.completed) return false;
      if (activeFilter === 'completed' && !task.completed) return false;
      if (activeFilter === 'high' && task.priority !== 'high') return false;
      if (search && !`${task.title} ${task.notes || ''} ${task.category || ''}`.toLowerCase().includes(search)) return false;
      return true;
    });

    visible.sort((a,b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return b.createdAt - a.createdAt;
    });

    list.innerHTML = '';
    empty.classList.toggle('hidden', visible.length !== 0);

    visible.forEach(task => {
      const item = document.createElement('article');
      item.className = `todo-item${task.completed ? ' is-complete' : ''}${isOverdue(task) ? ' is-overdue' : ''}`;
      item.dataset.id = task.id;

      const due = task.dueDate
        ? `<span class="todo-due ${isOverdue(task) ? 'overdue' : ''}">${isOverdue(task) ? '⚠ ' : '◷ '}${escapeHtml(formatDate(task.dueDate))}</span>`
        : '';

      item.innerHTML = `
        <button class="todo-check" type="button" aria-label="${task.completed ? 'Mark incomplete' : 'Mark complete'}">${task.completed ? '✓' : ''}</button>
        <div class="todo-content">
          <div class="todo-title-row"><h3>${escapeHtml(task.title)}</h3><span class="todo-priority ${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span></div>
          ${task.notes ? `<p>${escapeHtml(task.notes)}</p>` : ''}
          <div class="todo-meta"><span class="todo-category">${escapeHtml(task.category || 'Other')}</span>${due}</div>
        </div>
        <div class="todo-actions">
          <button type="button" class="todo-edit" aria-label="Edit task">Edit</button>
          <button type="button" class="todo-delete" aria-label="Delete task">Delete</button>
        </div>`;

      item.querySelector('.todo-check').addEventListener('click', () => toggle(task.id));
      item.querySelector('.todo-edit').addEventListener('click', () => edit(task.id));
      item.querySelector('.todo-delete').addEventListener('click', () => remove(task.id));
      list.appendChild(item);
    });

    updateStats(tasks);
  }

  function updateStats(tasks) {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const percent = total ? Math.round(completed / total * 100) : 0;
    if ($('todoTotal')) $('todoTotal').textContent = total;
    if ($('todoPending')) $('todoPending').textContent = pending;
    if ($('todoCompleted')) $('todoCompleted').textContent = completed;
    if ($('todoProgress')) $('todoProgress').textContent = `${percent}%`;
    if ($('todoProgressBar')) $('todoProgressBar').style.width = `${percent}%`;
  }

  function resetForm() {
    $('todoForm')?.reset();
    if ($('todoPriority')) $('todoPriority').value = 'medium';
    if ($('todoCategory')) $('todoCategory').value = 'Study';
    editingId = null;
    if ($('todoAddBtn')) $('todoAddBtn').textContent = '＋ Add Task';
  }

  function addOrUpdate(event) {
    event.preventDefault();
    const title = ($('todoTitle')?.value || '').trim();
    if (!title) return;

    const tasks = load();
    const payload = {
      title,
      notes: ($('todoNotes')?.value || '').trim(),
      priority: $('todoPriority')?.value || 'medium',
      dueDate: $('todoDueDate')?.value || '',
      category: $('todoCategory')?.value || 'Other'
    };

    if (editingId) {
      const task = tasks.find(t => t.id === editingId);
      if (task) Object.assign(task, payload);
    } else {
      tasks.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        ...payload,
        completed: false,
        createdAt: Date.now()
      });
    }

    save(tasks);
    resetForm();
    render();
  }

  function toggle(id) {
    const tasks = load();
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    task.completedAt = task.completed ? Date.now() : null;
    save(tasks);
    render();
  }

  function remove(id) {
    const task = load().find(t => t.id === id);
    if (!task) return;
    if (!confirm(`Delete "${task.title}"?`)) return;
    save(load().filter(t => t.id !== id));
    if (editingId === id) resetForm();
    render();
  }

  function edit(id) {
    const task = load().find(t => t.id === id);
    if (!task) return;
    editingId = id;
    $('todoTitle').value = task.title || '';
    $('todoNotes').value = task.notes || '';
    $('todoPriority').value = task.priority || 'medium';
    $('todoDueDate').value = task.dueDate || '';
    $('todoCategory').value = task.category || 'Other';
    $('todoAddBtn').textContent = '✓ Update Task';
    $('todoTitle').focus();
    $('todoForm').scrollIntoView({ behavior:'smooth', block:'center' });
  }

  function clearCompleted() {
    const tasks = load();
    const completed = tasks.filter(t => t.completed).length;
    if (!completed) return;
    if (!confirm(`Clear ${completed} completed task${completed === 1 ? '' : 's'}?`)) return;
    save(tasks.filter(t => !t.completed));
    render();
  }

  function bind() {
    document.querySelectorAll('.player-nav-btn[data-view="todo"]').forEach(btn => {
      btn.addEventListener('click', () => {
        setTimeout(render, 0);
        $('todoSection')?.scrollIntoView({ behavior:'smooth', block:'start' });
      });
    });
    $('todoForm')?.addEventListener('submit', addOrUpdate);
    $('todoSearch')?.addEventListener('input', render);
    $('todoClearCompleted')?.addEventListener('click', clearCompleted);
    document.querySelectorAll('.todo-filter').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.todo-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter || 'all';
      render();
    }));
    window.TodoList = { refresh: render };
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
