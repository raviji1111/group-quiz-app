const API = '/api';
let quiz = null;
let questions = [];
let currentQuestion = 0;
let selectedAnswer = null;
let answers = [];
let timeLeft = 0;
let timerInterval = null;
let quizStarted = false;
let violations = 0;
let playerName = '';
let maxQuizViolations = 3;
let sessionId = null;
let violationReasons = [];
let warningOpen = false;
let isFinishing = false;
let lastViolationTime = 0;
let submitting = false;
let violationMonitoringReady = false;
let monitoringTimer = null;
let waitingTimer = null;
const SESSION_STORAGE_KEY = 'groupQuizActiveSession';
let playerToken = localStorage.getItem('groupQuizPlayerToken') || '';
let loggedPlayer = JSON.parse(localStorage.getItem('groupQuizPlayer') || 'null');

const $ = id => document.getElementById(id);
const startScreen = $('startScreen'), quizScreen = $('quizScreen'), resultScreen = $('resultScreen');
const quizSelect = $('quizSelect'), playerNameInput = $('playerName'), startBtn = $('startBtn');
// Keep a single quiz selector on the player screen; older UI markup may contain a duplicate.
document.querySelectorAll('#quizSelect').forEach((el, i) => { if (i > 0) el.remove(); });
const accountStatus = $('accountStatus'), accountBtn = $('accountBtn'), accountPanel = $('accountPanel');
const questionNumber = $('questionNumber'), totalQuestions = $('totalQuestions'), questionText = $('questionText');
const optionsContainer = $('optionsContainer'), nextBtn = $('nextBtn'), timer = $('timer'), progressBar = $('progressBar');
const scoreElement = $('score'), resultTotal = $('resultTotal'), resultPlayer = $('resultPlayer'), resultMessage = $('resultMessage'), restartBtn = $('restartBtn');
const warningModal = $('warningModal'), warningMessage = $('warningMessage'), warningOkBtn = $('warningOkBtn');
if (warningModal) warningModal.classList.remove('show');
const violationCount = $('violationCount'), maxViolations = $('maxViolations'), warningSound = $('warningSound');
const accountName = $('accountName'), accountEmail = $('accountEmail'), accountPassword = $('accountPassword');

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(playerToken ? { Authorization: `Bearer ${playerToken}` } : {}), ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed.');
  return data;
}
function playerMessage(msg, error = false) { $('playerMessage').textContent = msg; $('playerMessage').classList.toggle('error', error); }

function updateAccountUI() {
  if (loggedPlayer) { accountStatus.textContent = `Logged in: ${loggedPlayer.name}`; accountBtn.textContent = 'Account'; playerNameInput.value = loggedPlayer.name; }
  else { accountStatus.textContent = 'Guest mode'; accountBtn.textContent = 'Login / Register'; }
}
accountBtn.addEventListener('click', () => accountPanel.classList.toggle('hidden'));
$('guestBtn').addEventListener('click', () => { playerToken = ''; loggedPlayer = null; localStorage.removeItem('groupQuizPlayerToken'); localStorage.removeItem('groupQuizPlayer'); updateAccountUI(); accountPanel.classList.add('hidden'); });
$('registerBtn').addEventListener('click', async () => {
  try { const data = await api('/player/register', { method: 'POST', body: JSON.stringify({ name: accountName.value.trim(), email: accountEmail.value.trim(), password: accountPassword.value }) }); playerToken = data.token; loggedPlayer = data.player; localStorage.setItem('groupQuizPlayerToken', playerToken); localStorage.setItem('groupQuizPlayer', JSON.stringify(loggedPlayer)); updateAccountUI(); accountPanel.classList.add('hidden'); } catch (e) { $('accountMessage').textContent = e.message; }
});
$('loginAccountBtn').addEventListener('click', async () => {
  try { const data = await api('/player/login', { method: 'POST', body: JSON.stringify({ email: accountEmail.value.trim(), password: accountPassword.value }) }); playerToken = data.token; loggedPlayer = data.player; localStorage.setItem('groupQuizPlayerToken', playerToken); localStorage.setItem('groupQuizPlayer', JSON.stringify(loggedPlayer)); updateAccountUI(); accountPanel.classList.add('hidden'); } catch (e) { $('accountMessage').textContent = e.message; }
});
updateAccountUI();

async function loadQuizList() {
  try {
    const { quizzes } = await api('/quizzes/public');
    quizSelect.innerHTML = '';
    if (!quizzes.length) { quizSelect.innerHTML = '<option value="">No published quizzes</option>'; startBtn.disabled = true; return; }
    quizzes.forEach(q => { const o = document.createElement('option'); o.value = q._id; o.textContent = `${q.title} — ${q.questions.length} questions · ${q.time} min`; quizSelect.appendChild(o); });
    const requested = new URLSearchParams(location.search).get('quiz');
    if (requested && quizzes.some(q => q._id === requested)) quizSelect.value = requested;
  } catch (e) { quizSelect.innerHTML = '<option value="">Could not load quizzes</option>'; startBtn.disabled = true; playerMessage(e.message, true); }
}

async function startQuiz() {
  playerName = playerNameInput.value.trim();
  const quizId = quizSelect.value;
  if (!playerName) return playerMessage('Please enter your name.', true);
  if (!quizId) return playerMessage('Please select a quiz.', true);
  try {
    startBtn.disabled = true;
    const data = await api(`/quizzes/${quizId}/public`);
    quiz = data.quiz;
    const session = await api('/attempts/start', { method: 'POST', body: JSON.stringify({ quizId, playerName }) });
    playerName = session.playerName || playerName;
    localStorage.setItem(SESSION_STORAGE_KEY, String(session.sessionId));
    await setupSession(session, quiz);
  } catch (e) { playerMessage(e.message, true); } finally { startBtn.disabled = false; }
}

async function setupSession(session, quizData) {
  clearTimeout(waitingTimer);
  sessionId = String(session.sessionId);
  quiz = quizData;
  questions = quiz.questions;
  maxQuizViolations = session.maxViolations ?? quiz.maxViolations;
  currentQuestion = Number(session.currentQuestion || 0);
  answers = Array.isArray(session.answers) && session.answers.length === questions.length ? session.answers.map(Number) : Array(questions.length).fill(-1);
  violations = Number(session.violations || 0);
  violationReasons = Array.isArray(session.violationReasons) ? session.violationReasons : [];
  const startAt = new Date(session.startedAt).getTime();
  const now = Date.now();
  if (session.status === 'waiting' || startAt > now) {
    quizStarted = false;
    startScreen.classList.add('active'); quizScreen.classList.remove('active'); resultScreen.classList.remove('active');
    startBtn.disabled = true;
    const tick = () => {
      const remaining = Math.max(0, startAt - Date.now());
      if (remaining <= 0) { startBtn.disabled = false; beginActiveQuiz(session); return; }
      const seconds = Math.ceil(remaining / 1000);
      const mins = Math.floor(seconds / 60), secs = seconds % 60;
      playerMessage(`Joined successfully. Quiz starts in ${mins}:${String(secs).padStart(2,'0')}. Keep this page open.`);
      waitingTimer = setTimeout(tick, 1000);
    };
    tick();
    return;
  }
  beginActiveQuiz(session);
}

function beginActiveQuiz(session) {
  quizStarted = true; isFinishing = false; submitting = false; warningOpen = false; violationMonitoringReady = false;
  clearTimeout(monitoringTimer);
  timeLeft = Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
  if (timeLeft <= 0) return finishQuiz('auto-submitted');
  totalQuestions.textContent = questions.length; resultTotal.textContent = questions.length; violationCount.textContent = violations; maxViolations.textContent = maxQuizViolations;
  startScreen.classList.remove('active'); quizScreen.classList.add('active'); resultScreen.classList.remove('active'); loadQuestion(); startTimer();
  if (quiz.examMode) {
    requestFullscreen();
    monitoringTimer = setTimeout(() => { violationMonitoringReady = true; }, 2000);
  } else violationMonitoringReady = true;
}

async function resumeStoredSession() {
  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return;
  try {
    const data = await api(`/attempts/session/${encodeURIComponent(stored)}`);
    playerName = playerNameInput.value.trim() || loggedPlayer?.name || '';
    if (data.session.submitted) { localStorage.removeItem(SESSION_STORAGE_KEY); return; }
    quizSelect.value = data.session.quizId;
    playerNameInput.value = playerName || playerNameInput.value;
    await setupSession(data.session, data.quiz);
  } catch (e) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

startBtn.addEventListener('click', startQuiz);
playerNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') startQuiz(); });

function loadQuestion() {
  const q = questions[currentQuestion];
  if (!q) return finishQuiz();
  selectedAnswer = answers[currentQuestion] >= 0 ? answers[currentQuestion] : null;
  questionNumber.textContent = currentQuestion + 1; questionText.textContent = q.question; optionsContainer.innerHTML = '';
  q.options.forEach((option, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'option'; button.textContent = `${String.fromCharCode(65 + index)}. ${option}`;
    if (index === selectedAnswer) button.classList.add('selected');
    button.addEventListener('click', () => selectAnswer(index)); optionsContainer.appendChild(button);
  });
  nextBtn.disabled = selectedAnswer === null;
  nextBtn.textContent = currentQuestion === questions.length - 1 ? 'Submit Quiz' : 'Next';
  progressBar.style.width = `${((currentQuestion + 1) / questions.length) * 100}%`;
}
function selectAnswer(index) {
  if (!quizStarted) return;
  selectedAnswer = index; answers[currentQuestion] = index;
  document.querySelectorAll('.option').forEach((b, i) => b.classList.toggle('selected', i === index));
  nextBtn.disabled = false;
  saveProgress();
}
async function saveProgress() {
  if (!sessionId || !quizStarted) return;
  try { await api(`/attempts/session/${encodeURIComponent(sessionId)}/progress`, { method: 'PATCH', body: JSON.stringify({ currentQuestion, answers, violations, violationReasons }) }); } catch (e) {}
}

nextBtn.addEventListener('click', async () => { if (selectedAnswer === null) return; if (currentQuestion >= questions.length - 1) finishQuiz(); else { currentQuestion++; loadQuestion(); await saveProgress(); } });

function startTimer() { clearInterval(timerInterval); updateTimer(); timerInterval = setInterval(() => { if (!quizStarted) return; timeLeft = Math.max(0, timeLeft - 1); updateTimer(); if (timeLeft <= 0) finishQuiz('auto-submitted'); }, 1000); }
function updateTimer() { timer.textContent = `${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}`; }

async function finishQuiz(status = 'completed') {
  if (!quizStarted || !violationMonitoringReady || isFinishing || submitting) return;
  isFinishing = true; quizStarted = false; violationMonitoringReady = false; clearTimeout(monitoringTimer); clearInterval(timerInterval); submitting = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  try {
    const result = await api('/attempts', { method: 'POST', body: JSON.stringify({ sessionId, answers, violations, violationReasons, status }) });
    scoreElement.textContent = result.score; resultTotal.textContent = result.total; resultPlayer.textContent = `Player: ${playerName}`;
    const percentage = result.percentage;
    resultMessage.textContent = percentage >= 80 ? 'Excellent performance!' : percentage >= 60 ? 'Good job!' : percentage >= 40 ? 'Keep practicing!' : 'Keep learning and try again!';
    quizScreen.classList.remove('active'); resultScreen.classList.add('active');
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    alert(`Could not submit quiz: ${e.message}`);
    quizStarted = true; isFinishing = false; submitting = false; startTimer();
  }
}

restartBtn.addEventListener('click', () => { clearTimeout(monitoringTimer); clearTimeout(waitingTimer); localStorage.removeItem(SESSION_STORAGE_KEY); violationMonitoringReady = false; resultScreen.classList.remove('active'); startScreen.classList.add('active'); playerNameInput.value = ''; timer.textContent = '00:00'; progressBar.style.width = '0%'; isFinishing = false; submitting = false; });

async function requestFullscreen() { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); } catch (e) {} }

document.addEventListener('fullscreenchange', () => { if (quizStarted && violationMonitoringReady && quiz?.examMode && !document.fullscreenElement) registerViolation('You exited fullscreen mode.'); });
document.addEventListener('visibilitychange', () => { if (quizStarted && violationMonitoringReady && quiz?.examMode && document.hidden) registerViolation('You left the quiz window.'); });
window.addEventListener('blur', () => { if (quizStarted && violationMonitoringReady && quiz?.examMode) registerViolation('Quiz window lost focus.'); });

function registerViolation(message) {
  if (!quizStarted || isFinishing || !quiz?.examMode) return;
  const now = Date.now(); if (now - lastViolationTime < 1500) return; lastViolationTime = now;
  violations++; violationReasons.push(message); violationCount.textContent = violations;
  if (warningSound) { warningSound.currentTime = 0; warningSound.play().catch(() => {}); }
  if (violations >= maxQuizViolations) { alert('Maximum violations reached. Your quiz will be submitted.'); finishQuiz('auto-submitted'); return; }
  showWarning(message);
}
function showWarning(message) { if (!quizStarted || warningOpen) return; warningOpen = true; warningMessage.textContent = `${message} Please return to the quiz.`; warningModal.classList.add('show'); }
warningOkBtn.addEventListener('click', () => { warningOpen = false; warningModal.classList.remove('show'); if (quiz?.examMode) requestFullscreen(); });

['contextmenu','copy','cut','paste'].forEach(type => document.addEventListener(type, e => { if (quizStarted) e.preventDefault(); }));

loadQuizList();
setTimeout(resumeStoredSession, 150);
