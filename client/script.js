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
let liveScoreInterval = null;
const SESSION_STORAGE_KEY = 'groupQuizActiveSession';
let playerToken = localStorage.getItem('groupQuizPlayerToken') || '';
let loggedPlayer = JSON.parse(localStorage.getItem('groupQuizPlayer') || 'null');

const $ = id => document.getElementById(id);


function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

// Render fractions like the source PDF: 33 1/3% with a small stacked numerator/denominator.
function formatMathText(value) {
  let text = String(value ?? '');

  // Remove optional TeX/MathJax delimiters from older questions.
  text = text.replace(/\\?\\\(/g, '').replace(/\\?\\\)/g, '')
             .replace(/\\?\\\[/g, '').replace(/\\?\\\]/g, '');

  // Normalize TeX fraction commands so old records continue to work.
  text = text.replace(/\\+(?:d)?frac/g, '\\frac');
  text = escapeHtml(text);

  // TeX mixed fractions: 33\\frac{1}{3} -> stacked 1/3 next to 33.
  text = text.replace(/(\d+)\s*\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
    '<span class="mixed-number"><span class="mixed-whole">$1</span><span class="mixed-fraction"><span class="fraction-top">$2</span><span class="fraction-bottom">$3</span></span></span>');

  // TeX standalone fractions: \\frac{1}{3}.
  text = text.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
    '<span class="mixed-fraction standalone-fraction"><span class="fraction-top">$1</span><span class="fraction-bottom">$2</span></span>');

  // Plain copy/paste fractions: 33 1/3%, 3 1/4%, 17 1/2%, etc.
  // This is the format used when questions are copied from the PDF into the site.
  text = text.replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g,
    '<span class="mixed-number"><span class="mixed-whole">$1</span><span class="mixed-fraction"><span class="fraction-top">$2</span><span class="fraction-bottom">$3</span></span></span>');

  // Plain standalone fractions: 1/5, 3/4, 25/400, etc.
  text = text.replace(/(?<![\d/>])\b(\d+)\s*\/\s*(\d+)\b/g,
    '<span class="mixed-fraction standalone-fraction"><span class="fraction-top">$1</span><span class="fraction-bottom">$2</span></span>');

  // Keep bilingual questions in two clean lines. Many PDF extractors return
  // English + Hindi on one line (e.g. "...is? किसी..."). Split only at the
  // English-to-Devanagari boundary so spaces inside the Hindi sentence remain intact.
  text = text.replace(/([A-Za-z0-9%\)\]\?\!\.:;])\s+(?=[\u0900-\u097F])/g, '$1<br class="bilingual-break">');
  text = text.replace(/\r?\n/g, '<br class="bilingual-break">');

  return text;
}

function setFormattedText(el, value) {
  if (el) el.innerHTML = formatMathText(value);
}

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

// Player theme: light/dark mode, remembered on this browser.
const themeToggle = $('themeToggle');
const savedTheme = localStorage.getItem('groupQuizTheme');
if (savedTheme === 'dark') document.body.classList.add('player-dark');
if (themeToggle) {
  const syncThemeIcon = () => {
    const dark = document.body.classList.contains('player-dark');
    themeToggle.textContent = dark ? '☀️' : '🌙';
    themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.title = dark ? 'Light mode' : 'Dark mode';
  };
  syncThemeIcon();
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('player-dark');
    localStorage.setItem('groupQuizTheme', document.body.classList.contains('player-dark') ? 'dark' : 'light');
    syncThemeIcon();
  });
}


async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(playerToken ? { Authorization: `Bearer ${playerToken}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));

  // A player JWT can expire or become invalid after a server/JWT_SECRET
  // change. Previously the UI trusted localStorage and stayed stuck on
  // "Loading quizzes..." even though the API had returned 401.
  if (res.status === 401 && data.code === 'AUTH_REQUIRED') {
    playerToken = '';
    loggedPlayer = null;
    localStorage.removeItem('groupQuizPlayerToken');
    localStorage.removeItem('groupQuizPlayer');
    updateAccountUI();
    throw new Error('Your login session expired. Please login again.');
  }

  if (!res.ok) throw new Error(data.message || 'Request failed.');
  return data;
}
function playerMessage(msg, error = false) { $('playerMessage').textContent = msg; $('playerMessage').classList.toggle('error', error); }

function setAuthView() {
  const gate = $('authGate');
  const hub = $('quizHubContent');
  if (loggedPlayer && playerToken) {
    gate?.classList.add('hidden');
    hub?.classList.remove('hidden');
  } else {
    gate?.classList.remove('hidden');
    hub?.classList.add('hidden');
  }
}

function updateAccountUI() {
  setAuthView();
  if (loggedPlayer && playerToken) {
    accountStatus.textContent = `Logged in: ${loggedPlayer.name}`;
    if ($('accountStatusMirror')) $('accountStatusMirror').textContent = `Signed in as ${loggedPlayer.name}. Choose a subject or topic to begin.`;
    accountBtn.textContent = 'Account';
    playerNameInput.value = loggedPlayer.name;
    startBtn.disabled = false;
  } else {
    accountStatus.textContent = 'Registration required';
    if ($('accountStatusMirror')) $('accountStatusMirror').textContent = 'Please register or login to attempt quizzes.';
    accountBtn.textContent = 'Login / Register';
    playerNameInput.value = '';
    startBtn.disabled = true;
  }
}

function logoutPlayer() {
  playerToken = '';
  loggedPlayer = null;
  localStorage.removeItem('groupQuizPlayerToken');
  localStorage.removeItem('groupQuizPlayer');
  clearInterval(liveScoreInterval);
  updateAccountUI();
  renderSubjectGrid([]);
  renderQuizCards([]);
  renderLiveCards([]);
  if ($('accountMessage')) $('accountMessage').textContent = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

accountBtn.addEventListener('click', () => {
  if (loggedPlayer && playerToken) {
    const ok = confirm(`Logged in as ${loggedPlayer.name}.\n\nDo you want to logout?`);
    if (ok) logoutPlayer();
  } else {
    $('accountName')?.focus();
    $('authGate')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

$('registerBtn').addEventListener('click', async () => {
  const message = $('accountMessage');
  try {
    if (!accountName.value.trim() || !accountEmail.value.trim() || accountPassword.value.length < 6) throw new Error('Please enter your name, email and a password of at least 6 characters.');
    const data = await api('/player/register', { method: 'POST', body: JSON.stringify({ name: accountName.value.trim(), email: accountEmail.value.trim(), password: accountPassword.value }) });
    playerToken = data.token;
    loggedPlayer = data.player;
    localStorage.setItem('groupQuizPlayerToken', playerToken);
    localStorage.setItem('groupQuizPlayer', JSON.stringify(loggedPlayer));
    if (message) message.textContent = 'Account created successfully. Loading your quiz hub...';
    updateAccountUI();
    await loadQuizList();
    document.getElementById('quizHubContent')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { if (message) message.textContent = e.message; }
});

$('loginAccountBtn').addEventListener('click', async () => {
  const message = $('accountMessage');
  try {
    if (!accountEmail.value.trim() || !accountPassword.value) throw new Error('Enter your email and password to login.');
    const data = await api('/player/login', { method: 'POST', body: JSON.stringify({ email: accountEmail.value.trim(), password: accountPassword.value }) });
    playerToken = data.token;
    loggedPlayer = data.player;
    localStorage.setItem('groupQuizPlayerToken', playerToken);
    localStorage.setItem('groupQuizPlayer', JSON.stringify(loggedPlayer));
    if (message) message.textContent = 'Login successful. Loading your quiz hub...';
    updateAccountUI();
    await loadQuizList();
    document.getElementById('quizHubContent')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { if (message) message.textContent = e.message; }
});

updateAccountUI();

async function loadQuizList() {
  if (!loggedPlayer || !playerToken) {
    setAuthView();
    if (quizSelect) quizSelect.innerHTML = '<option value="">Register / Login to view quizzes</option>';
    if (startBtn) startBtn.disabled = true;
    renderSubjectGrid([]); renderQuizCards([]); renderLiveCards([]);
    return;
  }
  try {
    const { quizzes } = await api('/quizzes/public');
    if (!quizSelect) return;
    quizSelect.innerHTML = '';
    if (!quizzes.length) {
      quizSelect.innerHTML = '<option value="">No published quizzes</option>';
      startBtn.disabled = true;
      renderSubjectGrid([]); renderQuizCards([]); renderLiveCards([]);
      return;
    }
    quizzes.forEach(q => {
      const o = document.createElement('option');
      o.value = q._id;
      o.textContent = `${q.title} — ${q.questions.length} questions · ${q.time} min`;
      quizSelect.appendChild(o);
    });
    const requested = new URLSearchParams(location.search).get('quiz');
    if (requested && quizzes.some(q => q._id === requested)) quizSelect.value = requested;
    window.availableQuizzes = quizzes;
    renderSubjectGrid(quizzes);
    renderQuizCards(quizzes);
    await loadLiveQuizzes();
  } catch (e) {
    quizSelect.innerHTML = `<option value="">${escapeHtml(e.message || 'Could not load quizzes')}</option>`;
    startBtn.disabled = true;
    renderSubjectGrid([]);
    renderQuizCards([]);
    renderLiveCards([]);
    playerMessage(e.message, true);
  }
}

function renderSubjectGrid(quizzes) {
  const grid = $('subjectGrid'); if (!grid) return;
  grid.innerHTML = '';
  const map = new Map();
  (quizzes || []).forEach(q => {
    const subject = q.subject || 'General';
    if (!map.has(subject)) map.set(subject, []);
    map.get(subject).push(q);
  });
  if (!map.size) { grid.innerHTML = '<div class="empty-state">No published quizzes are available yet.</div>'; return; }
  [...map.entries()].forEach(([subject, list]) => {
    const topics = [...new Set(list.map(q => q.topic || 'General'))];
    const card = document.createElement('button');
    card.className = 'subject-card';
    card.innerHTML = `<span class="subject-icon">${subjectIcon(subject)}</span><span><strong></strong><small>${list.length} quiz${list.length === 1 ? '' : 'zes'} · ${topics.length} topic${topics.length === 1 ? '' : 's'}</small></span><b>→</b>`;
    card.querySelector('strong').textContent = subject;
    card.onclick = () => {
      renderQuizCards(list, subject);
      document.getElementById('quizCatalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    grid.appendChild(card);
  });
}
function subjectIcon(s) { const x = String(s).toLowerCase(); if (x.includes('math')) return '∑'; if (x.includes('reason')) return '⌁'; if (x.includes('gk') || x.includes('general')) return '◆'; if (x.includes('hindi')) return 'अ'; if (x.includes('science')) return '⚗'; return '✦'; }

function renderQuizCards(quizzes, title = 'All Quizzes') {
  const grid = $('quizCards'), heading = $('catalogTitle'), filter = $('topicFilter');
  if (!grid) return;
  grid.innerHTML = '';
  if (heading) heading.textContent = title;
  if (filter) filter.innerHTML = '';
  const list = quizzes || [];
  const topics = [...new Set(list.map(q => q.topic || 'General'))];
  let selectedTopic = '';
  const draw = (items) => {
    grid.innerHTML = '';
    items.slice(0, 60).forEach(q => {
      const card = document.createElement('article');
      card.className = 'quiz-catalog-card';
      card.innerHTML = `<div class="catalog-top"><span class="subject-pill"></span><span>${q.time} min</span></div><h3></h3><p class="catalog-topic"></p><div class="catalog-bottom"><span>${q.questions.length} Questions</span><button>Start →</button></div>`;
      card.querySelector('.subject-pill').textContent = q.subject || 'General';
      card.querySelector('h3').textContent = q.title;
      card.querySelector('.catalog-topic').textContent = `Topic: ${q.topic || 'General'}`;
      card.querySelector('button').onclick = () => { quizSelect.value = q._id; startQuiz(); };
      grid.appendChild(card);
    });
    if (!items.length) grid.innerHTML = '<div class="empty-state">No quizzes in this topic yet.</div>';
  };
  if (filter && topics.length > 0) {
    const all = document.createElement('button'); all.className = 'topic-chip active'; all.textContent = 'All topics';
    all.onclick = () => { selectedTopic = ''; filter.querySelectorAll('.topic-chip').forEach(x => x.classList.remove('active')); all.classList.add('active'); draw(list); };
    filter.appendChild(all);
    topics.forEach(topic => {
      const chip = document.createElement('button'); chip.className = 'topic-chip'; chip.textContent = topic;
      chip.onclick = () => { selectedTopic = topic; filter.querySelectorAll('.topic-chip').forEach(x => x.classList.remove('active')); chip.classList.add('active'); draw(list.filter(q => (q.topic || 'General') === selectedTopic)); };
      filter.appendChild(chip);
    });
  }
  draw(list);
}

async function loadLiveQuizzes() {
  const wrap = $('liveCards'); if (!wrap || !loggedPlayer || !playerToken) return;
  try { const data = await api('/live/active'); renderLiveCards(data.quizzes || []); } catch (e) { renderLiveCards([]); }
}
function renderLiveCards(quizzes) {
  const wrap = $('liveCards'); if (!wrap) return;
  wrap.innerHTML = '';
  if (!quizzes.length) { wrap.innerHTML = '<div class="live-empty">No live quiz right now. Check back soon.</div>'; return; }
  quizzes.forEach(q => {
    const card = document.createElement('article'); card.className = 'live-player-card';
    card.innerHTML = `<div class="live-player-top"><span>🔴 LIVE NOW</span><strong></strong></div><p></p><h3></h3><div class="live-player-meta"><span>${q.questions.length} Questions</span><span>${q.time} Minutes</span></div><button>Join Live Quiz →</button>`;
    card.querySelector('strong').textContent = q.subject || 'General'; card.querySelector('p').textContent = `Topic: ${q.topic || 'General'}`; card.querySelector('h3').textContent = q.title;
    card.querySelector('button').onclick = () => { quizSelect.value = q._id; startQuiz(); };
    wrap.appendChild(card);
  });
}

async function startQuiz() {
  if (!loggedPlayer || !playerToken) { accountPanel.classList.remove('hidden'); return playerMessage('Please register or login before attempting a quiz.', true); }
  playerName = loggedPlayer.name;
  const quizId = quizSelect.value;
  if (!playerName) return playerMessage('Please enter your name.', true);
  if (!quizId) return playerMessage('Please select a quiz.', true);
  try {
    startBtn.disabled = true;
    const data = await api(`/quizzes/${quizId}/public`);
    quiz = data.quiz;
    const session = await api('/attempts/start', { method: 'POST', body: JSON.stringify({ quizId, playerName, live: quiz.liveStatus === 'live' }) });
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
  totalQuestions.textContent = questions.length; resultTotal.textContent = questions.length; violationCount.textContent = violations; maxViolations.textContent = maxQuizViolations; if($('quizSubjectBadge'))$('quizSubjectBadge').textContent=quiz.subject||'General'; if($('quizTopicBadge'))$('quizTopicBadge').textContent=quiz.topic||'General';
  startScreen.classList.remove('active'); quizScreen.classList.add('active'); resultScreen.classList.remove('active'); loadQuestion(); startTimer(); clearInterval(liveScoreInterval); if(quiz.liveStatus==='live') { showLiveBoard(); liveScoreInterval=setInterval(showLiveBoard,5000); }
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
startBtn.textContent = 'Start Selected Quiz';
playerNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') startQuiz(); });

function loadQuestion() {
  const q = questions[currentQuestion];
  if (!q) return finishQuiz();
  selectedAnswer = answers[currentQuestion] >= 0 ? answers[currentQuestion] : null;
  questionNumber.textContent = currentQuestion + 1; setFormattedText(questionText, q.question); optionsContainer.innerHTML = '';
  q.options.forEach((option, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'option'; button.innerHTML = `${String.fromCharCode(65 + index)}. ${formatMathText(option)}`;
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
  isFinishing = true; quizStarted = false; violationMonitoringReady = false; clearTimeout(monitoringTimer); clearInterval(timerInterval); clearInterval(liveScoreInterval); submitting = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  try {
    const result = await api('/attempts', { method: 'POST', body: JSON.stringify({ sessionId, answers, violations, violationReasons, status }) });
    scoreElement.textContent = result.score; resultTotal.textContent = result.total; resultPlayer.textContent = `Player: ${playerName}`;
    const percentage = result.percentage;
    resultMessage.textContent = percentage >= 80 ? 'Excellent performance!' : percentage >= 60 ? 'Good job!' : percentage >= 40 ? 'Keep practicing!' : 'Keep learning and try again!';
    quizScreen.classList.remove('active'); resultScreen.classList.add('active'); await showLiveBoard();
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    alert(`Could not submit quiz: ${e.message}`);
    quizStarted = true; isFinishing = false; submitting = false; startTimer();
  }
}

restartBtn.addEventListener('click', () => { clearInterval(liveScoreInterval); clearTimeout(monitoringTimer); clearTimeout(waitingTimer); localStorage.removeItem(SESSION_STORAGE_KEY); violationMonitoringReady = false; resultScreen.classList.remove('active'); startScreen.classList.add('active'); playerNameInput.value = ''; timer.textContent = '00:00'; progressBar.style.width = '0%'; isFinishing = false; submitting = false; });

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

document.querySelectorAll('.player-nav-btn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.player-nav-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const view=btn.dataset.view;if(!loggedPlayer||!playerToken){document.getElementById('authGate')?.scrollIntoView({behavior:'smooth',block:'center'});if($('accountMessage'))$('accountMessage').textContent='Please register or login first to open the quiz section.';return;}if(view==='live'){document.getElementById('livePreview')?.scrollIntoView({behavior:'smooth'});loadLiveQuizzes();}else if(view==='subjects'){document.getElementById('subjectGrid')?.scrollIntoView({behavior:'smooth'});}else{document.getElementById('quizHubContent')?.scrollIntoView({top:0,behavior:'smooth'});}}));
$('refreshLiveBtn')?.addEventListener('click',loadLiveQuizzes);
setInterval(()=>{if(!quizStarted)loadLiveQuizzes();},10000);
loadQuizList();
setTimeout(resumeStoredSession, 150);
