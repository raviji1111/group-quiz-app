(function () {
  const SESSION_KEY = 'groupQuizActiveSession';
  const MODE_KEY = 'groupQuizActiveMode';
  const api = () => window.gqApi;
  const store = (id) => { localStorage.setItem(SESSION_KEY, String(id)); localStorage.setItem(MODE_KEY, 'live'); };
  const clear = () => { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(MODE_KEY); };

  window.liveQuiz = {
    async load() {
      const data = await api()('/live/active');
      if (typeof window.renderLiveCards === 'function') window.renderLiveCards(data.quizzes || []);
      return data.quizzes || [];
    },
    async start(quizId) {
      const data = await api()(`/quizzes/${encodeURIComponent(quizId)}/public`);
      const session = await api()(`/live/${encodeURIComponent(quizId)}/join`, { method: 'POST', body: JSON.stringify({}) });
      store(session.sessionId);
      await window.gqSetupSession(session, data.quiz, 'live');
    },
    async resume(sessionId) {
      const data = await api()(`/live/session/${encodeURIComponent(sessionId)}`);
      if (data.session.submitted) { clear(); return false; }
      store(data.session.sessionId);
      await window.gqSetupSession(data.session, data.quiz, 'live');
      return true;
    },
    async progress(sessionId, payload) {
      return api()(`/live/session/${encodeURIComponent(sessionId)}/progress`, { method: 'PATCH', body: JSON.stringify(payload) });
    },
    async submit(payload) {
      return api()('/live/submit', { method: 'POST', body: JSON.stringify(payload) });
    },
    async board(quizId) {
      return api()(`/live/${encodeURIComponent(quizId)}/board`);
    },
    clear
  };
})();

window.showLiveBoard = async function () {
  const boardEl = document.getElementById('resultLiveBoard');
  if (!boardEl || !window.liveQuiz || !window.gqCurrentQuizId) return;
  try {
    const data = await window.liveQuiz.board(window.gqCurrentQuizId);
    if (!data.quiz?.showLeaderboard && !data.quiz?.showLiveScore) { boardEl.innerHTML = ''; return; }
    const rows = data.leaderboard || [];
    boardEl.innerHTML = '<h3>Live Leaderboard</h3>' + (rows.length ? rows.map(r => `<div><span>#${r.rank} ${String(r.playerName || '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</span><strong>${r.score}/${r.total}</strong></div>`).join('') : '<p>No leaderboard data yet.</p>');
  } catch (e) { boardEl.innerHTML = ''; }
};
