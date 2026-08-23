(function () {
  const SESSION_KEY = 'groupQuizActiveSession';
  const MODE_KEY = 'groupQuizActiveMode';
  const api = () => window.gqApi;
  const store = (id) => { localStorage.setItem(SESSION_KEY, String(id)); localStorage.setItem(MODE_KEY, 'published'); };
  const clear = () => { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(MODE_KEY); };

  window.publishedQuiz = {
    async start(quizId) {
      const data = await api()(`/quizzes/${encodeURIComponent(quizId)}/public`);
      const session = await api()('/published/start', { method: 'POST', body: JSON.stringify({ quizId }) });
      store(session.sessionId);
      await window.gqSetupSession(session, data.quiz, 'published');
    },
    async resume(sessionId) {
      const data = await api()(`/published/session/${encodeURIComponent(sessionId)}`);
      if (data.session.submitted) { clear(); return false; }
      store(data.session.sessionId);
      await window.gqSetupSession(data.session, data.quiz, 'published');
      return true;
    },
    async progress(sessionId, payload) {
      return api()(`/published/session/${encodeURIComponent(sessionId)}/progress`, { method: 'PATCH', body: JSON.stringify(payload) });
    },
    async submit(payload) {
      return api()('/published/submit', { method: 'POST', body: JSON.stringify(payload) });
    },
    clear
  };
})();
