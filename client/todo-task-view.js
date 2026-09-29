/* =========================================================
   TODO TASK VIEW — tap-to-expand process panel
   Keeps task-card interaction separate from database/save logic.
   ========================================================= */
(() => {
  'use strict';

  function toggle(item) {
    const details = item.querySelector('.todo-task-details');
    if (!details) return;
    const expanded = item.classList.toggle('is-expanded');
    details.hidden = !expanded;
    item.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const hint = item.querySelector('.todo-task-hint');
    if (hint) hint.innerHTML = expanded ? 'Hide process <span>⌃</span>' : 'Tap to view process <span>⌄</span>';
  }

  function bind(item) {
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'button');
    item.setAttribute('aria-expanded', 'false');
    item.addEventListener('click', event => {
      if (event.target.closest('button,input,textarea,select,label,a')) return;
      toggle(item);
    });
    item.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target !== item) return;
      event.preventDefault();
      toggle(item);
    });
  }

  window.TodoTaskView = { bind };
})();
