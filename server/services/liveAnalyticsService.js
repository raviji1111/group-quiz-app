const QuizSession = require('../models/QuizSession');
const Attempt = require('../models/Attempt');
const { currentLiveRunFilter } = require('../utils/live-run-scope');

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

async function buildLiveAnalytics(quiz) {
  const [sessions, attempts] = await Promise.all([
    QuizSession.find(currentLiveRunFilter(quiz)).lean(),
    Attempt.find({ quiz: quiz._id, createdAt: { $gte: quiz.liveLaunchAt || quiz.createdAt } }).lean()
  ]);
  const now = Date.now();
  const questionCount = quiz.questions.length;
  const activeThreshold = now - 20_000;
  const scores = attempts.map(a => Number(a.percentage || 0));
  const answerCounts = Array.from({ length: questionCount }, () => [0, 0, 0, 0]);
  sessions.forEach(s => (s.answers || []).forEach((answer, i) => {
    if (answerCounts[i] && Number.isInteger(answer) && answer >= 0 && answer < 4) answerCounts[i][answer] += 1;
  }));

  const questions = quiz.questions.map((question, index) => {
    const counts = answerCounts[index];
    const answered = counts.reduce((sum, n) => sum + n, 0);
    const correct = counts[question.answer] || 0;
    return {
      index, answered, skipped: Math.max(0, sessions.length - answered),
      correctRate: answered ? Math.round(correct / answered * 10000) / 100 : 0,
      optionCounts: counts
    };
  });

  return {
    generatedAt: new Date(),
    summary: {
      joined: sessions.length,
      active: sessions.filter(s => !s.submitted && new Date(s.lastSeenAt).getTime() >= activeThreshold).length,
      offline: sessions.filter(s => !s.submitted && new Date(s.lastSeenAt).getTime() < activeThreshold).length,
      submitted: sessions.filter(s => s.submitted).length,
      completionRate: sessions.length ? Math.round(sessions.filter(s => s.submitted).length / sessions.length * 10000) / 100 : 0,
      averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) / 100 : 0,
      medianScore: percentile(scores, 0.5),
      p90Score: percentile(scores, 0.9),
      violations: sessions.reduce((sum, s) => sum + Number(s.violations || 0), 0)
    },
    questions
  };
}

module.exports = { buildLiveAnalytics };

