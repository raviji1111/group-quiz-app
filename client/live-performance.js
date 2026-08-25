/* Phase 4 — #18 Live Performance Statistics (admin only, isolated module).
   Self-driving: it watches window.liveBoardQuizId (set by admin.js when a LIVE
   board is opened) instead of requiring edits inside admin.js. */
(() => {
  let timer = null;
  let lastQuizId = '';

  function host() { return document.querySelector('[data-live-performance]'); }

  function render(data) {
    const box = host();
    if (!box) return;
    const s = data?.summary;
    if (!s) { box.textContent = 'Performance statistics unavailable.'; return; }
    // textContent (not innerHTML) so participant/analytics data can never execute.
    box.textContent =
      `${s.active} active · ${s.offline} offline · ${s.submitted} submitted · ` +
      `${s.completionRate}% completed · avg ${s.averageScore}% · median ${s.medianScore}% · ` +
      `p90 ${s.p90Score}% · ${s.violations} violations`;
  }

  async function refresh(quizId) {
    if (!quizId) return;
    const token = localStorage.getItem('groupQuizAdminToken') || '';
    if (!token) return; // Not signed in as admin: stay silent instead of erroring.
    try {
      const res = await fetch(`/api/live-analytics/${encodeURIComponent(quizId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 429) return;           // Rate limited: skip this tick.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      render(await res.json());
    } catch (error) {
      // Analytics are informational, so a failure must never break the LIVE board.
      console.warn('LIVE performance refresh skipped:', error.message);
    }
  }

  function tick() {
    const quizId = window.liveBoardQuizId || '';
    if (!quizId) return;
    if (quizId !== lastQuizId) { lastQuizId = quizId; }
    refresh(quizId);
  }

  function start() { if (timer) return; tick(); timer = setInterval(tick, 5000); }
  function stop() { clearInterval(timer); timer = null; }

  document.addEventListener('DOMContentLoaded', start);
  window.LivePerformance = { start, stop, refresh };
})();

