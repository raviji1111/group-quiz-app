/* ==========================================================
   PRO FEATURES: Question Bookmarking & Scorecard Generator
   ========================================================== */
(function () {
  // 1. Inject Bookmark Button into Quiz Question Area
  function injectBookmarkButton() {
    const questionBox = document.querySelector('.question-box, #quiz-play-area, section');
    if (!questionBox || document.getElementById('bookmarkQuestionBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'bookmarkQuestionBtn';
    btn.className = 'btn-3d';
    btn.style.cssText = 'margin-top: 12px; background: rgba(245, 158, 11, 0.2); border-color: #f59e0b; color: #fbbf24;';
    btn.innerHTML = '🔖 Bookmark to Study To-Do';
    
    btn.addEventListener('click', () => {
      const qTextElem = document.querySelector('#questionText, h2');
      const qText = qTextElem ? qTextElem.innerText : 'Practice Question';
      
      let savedBookmarks = JSON.parse(localStorage.getItem('quiz_bookmarks') || '[]');
      savedBookmarks.push({ text: qText, date: new Date().toLocaleDateString() });
      localStorage.setItem('quiz_bookmarks', JSON.stringify(savedBookmarks));

      btn.innerHTML = '✅ Saved to To-Do Hub!';
      btn.style.background = 'rgba(16, 185, 129, 0.2)';
      btn.style.borderColor = '#10b981';
      btn.style.color = '#34d399';

      setTimeout(() => {
        btn.innerHTML = '🔖 Bookmark to Study To-Do';
        btn.style.background = 'rgba(245, 158, 11, 0.2)';
        btn.style.borderColor = '#f59e0b';
        btn.style.color = '#fbbf24';
      }, 2500);
    });

    questionBox.appendChild(btn);
  }

  // 2. Render Bookmarked Questions inside todo.html
  function renderBookmarksOnTodoPage() {
    const container = document.getElementById('todoListContainer');
    if (!container || !window.location.pathname.includes('todo.html')) return;

    let savedBookmarks = JSON.parse(localStorage.getItem('quiz_bookmarks') || '[]');
    if (savedBookmarks.length === 0) return;

    const section = document.createElement('div');
    section.className = 'card-3d';
    section.style.gridColumn = 'span 2';
    section.innerHTML = `
      <span class="badge-3d" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border-color: #f59e0b;">🔖 BOOKMARKED MISTAKES & REVISIONS</span>
      <h3 style="margin-top: 8px;">Saved Questions for Revision</h3>
      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 12px;">
        ${savedBookmarks.map((b, idx) => `
          <div style="background: rgba(15, 23, 42, 0.5); padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(245, 158, 11, 0.3); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: #fbbf24;">#${idx + 1}</strong> <span style="margin-left: 8px; color: #f8fafc;">${b.text}</span>
              <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">Saved on ${b.date}</div>
            </div>
            <button class="btn-3d danger remove-bm" data-index="${idx}" style="padding: 6px 10px; font-size: 0.8rem;">❌ Clear</button>
          </div>
        `).join('')}
      </div>
    `;
    container.prepend(section);

    section.querySelectorAll('.remove-bm').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.target.dataset.index;
        savedBookmarks.splice(idx, 1);
        localStorage.setItem('quiz_bookmarks', JSON.stringify(savedBookmarks));
        section.remove();
        renderBookmarksOnTodoPage();
      });
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    injectBookmarkButton();
    renderBookmarksOnTodoPage();
    new MutationObserver(injectBookmarkButton).observe(document.body, { childList: true, subtree: true });
  });
})();
