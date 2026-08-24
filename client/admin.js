const API = '/api';
let token = localStorage.getItem('groupQuizAdminToken') || '';
let questions = [];
let quizzes = [];

const $ = id => document.getElementById(id);


// Render legacy TeX fractions as PDF-style mixed fractions everywhere in the UI.
// Editing fields keep the original source; only visible previews are formatted.
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

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

  return text;
}

function setFormattedText(el, value) {
  if (el) el.innerHTML = formatMathText(value);
}

function headers() {
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function api(path, options = {}) {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const baseHeaders = isForm ? { ...(token ? { Authorization: `Bearer ${token}` } : {}) } : headers();
  const res = await fetch(`${API}${path}`, { ...options, headers: { ...baseHeaders, ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) logout(false);
    throw new Error(data.message || 'Request failed.');
  }
  return data;
}

function showMessage(text, error = false) {
  const el = $('adminMessage');
  if (!el) { console.error(text); return; }
  el.textContent = text;
  el.classList.toggle('error', error);
  setTimeout(() => { if (el) el.textContent = ''; }, 3500);
}
function loginMessage(text) { $('loginMessage').textContent = text; }

function showDashboard() {
  $('loginView').classList.add('hidden');
  $('dashboardView').classList.remove('hidden');
  loadAll();
}
function showLogin() {
  $('dashboardView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
}
function logout(show = true) {
  token = '';
  localStorage.removeItem('groupQuizAdminToken');
  showLogin();
  if (show) loginMessage('Logged out.');
}

$('loginBtn').addEventListener('click', async () => {
  try {
    loginMessage('Signing in...');
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: $('loginEmail').value, password: $('loginPassword').value }) });
    token = data.token;
    localStorage.setItem('groupQuizAdminToken', token);
    loginMessage('');
    showDashboard();
  } catch (e) { loginMessage(e.message); }
});
$('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginBtn').click(); });
$('logoutBtn').addEventListener('click', () => logout());
$('newQuizBtn').addEventListener('click', resetEditor);

function resetEditor() {
  $('editorTitle').textContent = 'Create Quiz';
  $('quizId').value = '';
  $('quizTitle').value = '';
  $('quizSubject').value = '';
  $('quizTopic').value = '';
  $('quizTime').value = 10;
  $('joinStartAt').value = '';
  $('joinEndAt').value = '';
  $('scheduledStartAt').value = '';
  $('liveDuration').value = 30;
  $('showLiveScore').value = 'on';
  $('showLeaderboard').value = 'on';
  $('maxViolations').value = 3;
  $('examMode').value = 'on';
  questions = [];
  renderQuestions();
}

function addQuestion() {
  const question = $('questionInput').value.trim();
  const options = [$('optionA').value.trim(), $('optionB').value.trim(), $('optionC').value.trim(), $('optionD').value.trim()];
  const answer = Number($('correctAnswer').value);
  if (!question) return showMessage('Please enter the question.', true);
  if (options.some(x => !x)) return showMessage('Please fill all four options.', true);
  questions.push({ question, options, answer });
  renderQuestions();
  ['questionInput','optionA','optionB','optionC','optionD'].forEach(id => $(id).value = '');
  $('correctAnswer').value = '0';
  $('questionInput').focus();
}

function renderQuestions() {
  $('questionCount').textContent = questions.length;
  if ($('editorQuestionCount')) $('editorQuestionCount').textContent = questions.length;
  $('questionList').innerHTML = questions.length ? '' : '<div class="empty-state">No questions added yet.</div>';
  questions.forEach((q, index) => {
    const item = document.createElement('div'); item.className = 'question-item';
    const title = document.createElement('h3'); title.innerHTML = `${index + 1}. ${formatMathText(q.question)}`; item.appendChild(title);
    const options = document.createElement('div'); options.className = 'question-options';
    q.options.forEach((opt, oi) => { const el = document.createElement('div'); el.className = 'question-option' + (oi === q.answer ? ' correct-option' : ''); el.innerHTML = `${String.fromCharCode(65 + oi)}. ${formatMathText(opt)}`; options.appendChild(el); });
    item.appendChild(options);
    const actions = document.createElement('div'); actions.className = 'question-actions';
    const del = document.createElement('button'); del.className = 'small-btn delete-btn'; del.textContent = 'Delete'; del.onclick = () => { questions.splice(index, 1); renderQuestions(); };
    actions.appendChild(del); item.appendChild(actions); $('questionList').appendChild(item);
  });
}
$('clearQuestionsBtn').addEventListener('click', () => { if (questions.length && confirm('Delete all questions?')) { questions = []; renderQuestions(); } });

function quizPayload() {
  const toISO = id => { const v = $(id).value; return v ? new Date(v).toISOString() : null; };
  return { title: $('quizTitle').value.trim(), subject: $('quizSubject').value.trim() || 'General', topic: $('quizTopic').value.trim() || 'General', time: Number($('quizTime').value), maxViolations: Number($('maxViolations').value), examMode: $('examMode').value === 'on', joinStartAt: toISO('joinStartAt'), joinEndAt: toISO('joinEndAt'), scheduledStartAt: toISO('scheduledStartAt'), liveDuration: Number($('liveDuration').value || 30), liveJoinOpenAfter: Number($('liveJoinOpenAfter')?.value || 0), liveJoinCloseAfter: Number($('liveJoinCloseAfter')?.value || 0), liveStartAfter: Number($('liveStartAfter')?.value || 0), liveCloseAfter: Number($('liveCloseAfter')?.value || 0), showLiveScore: $('showLiveScore').value === 'on', showLeaderboard: $('showLeaderboard').value === 'on', questions };
}

$('saveQuizBtn').addEventListener('click', async () => {
  try {
    const id = $('quizId').value;
    const data = quizPayload();
    if (!data.title || !questions.length) return showMessage('Add a title and at least one question.', true);
    const result = await api(id ? `/quizzes/${id}` : '/quizzes', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
    $('quizId').value = result.quiz._id;
    $('editorTitle').textContent = 'Edit Quiz';
    showMessage('Quiz saved successfully.');
    await loadQuizzes();
  } catch (e) { showMessage(e.message, true); }
});

$('previewQuizBtn').addEventListener('click', async () => {
  if (!$('quizId').value) {
    showMessage('Save the quiz first, then preview it.', true);
    return;
  }
  window.location.href = `index.html?quiz=${encodeURIComponent($('quizId').value)}`;
});

async function loadQuizzes() {
  const data = await api('/quizzes');
  quizzes = data.quizzes;
  $('statQuizzes').textContent = quizzes.length;
  const list = $('quizList');
  list.innerHTML = quizzes.length ? '' : '<div class="empty-state">No quizzes yet.</div>';
  quizzes.forEach(q => {
    const card = document.createElement('div'); card.className = 'quiz-admin-item';
    const scheduleText = q.scheduledStartAt ? ` · Starts ${new Date(q.scheduledStartAt).toLocaleString()}` : '';
    const joinText = q.joinStartAt && q.joinEndAt ? ` · Join ${new Date(q.joinStartAt).toLocaleString()}–${new Date(q.joinEndAt).toLocaleString()}` : '';
    card.innerHTML = `<div><strong></strong><small><span class="subject-pill">${escapeHtml(q.subject || 'General')}</span> · ${escapeHtml(q.topic || 'General')} · ${q.questions.length} questions · ${q.time} min · ${q.isPublished ? 'Published' : 'Draft'}${scheduleText}${joinText}</small></div><div class="item-actions"></div>`;
    card.querySelector('strong').textContent = q.title;
    const actions = card.querySelector('.item-actions');
    const edit = document.createElement('button'); edit.className = 'small-btn'; edit.textContent = 'Edit'; edit.onclick = () => editQuiz(q._id);
    const toggle = document.createElement('button'); toggle.className = 'small-btn secondary-btn'; toggle.textContent = q.isPublished ? 'Unpublish' : 'Publish'; toggle.onclick = () => togglePublish(q);
    const del = document.createElement('button'); del.className = 'small-btn delete-btn'; del.textContent = 'Delete'; del.onclick = () => deleteQuiz(q._id);
    [edit,toggle,del].forEach(b => actions.appendChild(b));
    list.appendChild(card);
  });
}

async function editQuiz(id) {
  try {
    const { quiz } = await api(`/quizzes/${id}/admin`);
    $('editorTitle').textContent = 'Edit Quiz';
    $('quizId').value = quiz._id;
    $('quizTitle').value = quiz.title;
  $('quizSubject').value = quiz.subject || 'General';
  $('quizTopic').value = quiz.topic || 'General';
    $('quizTime').value = quiz.time;
  $('joinStartAt').value = quiz.joinStartAt ? new Date(quiz.joinStartAt).toISOString().slice(0,16) : '';
  $('joinEndAt').value = quiz.joinEndAt ? new Date(quiz.joinEndAt).toISOString().slice(0,16) : '';
  $('scheduledStartAt').value = quiz.scheduledStartAt ? new Date(quiz.scheduledStartAt).toISOString().slice(0,16) : '';
  $('liveDuration').value = quiz.liveDuration || 30;
  if($('liveJoinOpenAfter')) $('liveJoinOpenAfter').value = quiz.liveJoinOpenAfter || 0;
  if($('liveJoinCloseAfter')) $('liveJoinCloseAfter').value = quiz.liveJoinCloseAfter || 0;
  if($('liveStartAfter')) $('liveStartAfter').value = quiz.liveStartAfter || 0;
  if($('liveCloseAfter')) $('liveCloseAfter').value = quiz.liveCloseAfter || 0;
  $('showLiveScore').value = quiz.showLiveScore === false ? 'off' : 'on';
  $('showLeaderboard').value = quiz.showLeaderboard === false ? 'off' : 'on';
    $('maxViolations').value = quiz.maxViolations;
    $('examMode').value = quiz.examMode ? 'on' : 'off';
    questions = quiz.questions.map(q => ({ question: q.question, options: [...q.options], answer: q.answer }));
    renderQuestions();
  } catch (e) { showMessage(e.message, true); }
}
async function deleteQuiz(id) {
  if (!confirm('Delete this quiz and keep existing attempt history?')) return;
  try { await api(`/quizzes/${id}`, { method: 'DELETE' }); showMessage('Quiz deleted.'); await loadQuizzes(); await loadStatsAndHistory(); } catch (e) { showMessage(e.message, true); }
}
async function togglePublish(q) {
  try { await api(`/quizzes/${q._id}/publish`, { method: 'PATCH', body: JSON.stringify({ isPublished: !q.isPublished }) }); await loadQuizzes(); } catch (e) { showMessage(e.message, true); }
}

async function loadStatsAndHistory(quizId = $('attemptQuizFilter')?.value || '') {
  try {
    const path = quizId ? `/attempts?quizId=${encodeURIComponent(quizId)}` : '/attempts';
    const [stats, history] = await Promise.all([api('/attempts/stats'), api(path)]);
    $('statAttempts').textContent = stats.totalAttempts;
    $('statAverage').textContent = `${Number(stats.avgPercentage).toFixed(1)}%`;
    $('statViolations').textContent = stats.totalViolations;
    const body = $('historyBody'); body.innerHTML = '';
    $('historyTitle').textContent = quizId ? `Attempts — ${$('attemptQuizFilter').selectedOptions[0]?.textContent || 'Quiz'}` : 'Quiz Attempts';
    if (!history.attempts.length) {
      body.innerHTML = '<tr><td colspan="7">No attempts found for this quiz.</td></tr>';
      return;
    }
    history.attempts.forEach(a => {
      const tr = document.createElement('tr');
      const date = new Date(a.createdAt).toLocaleString();
      [a.playerName, a.quiz?.title || 'Deleted quiz', `${a.score}/${a.total} (${a.percentage}%)`, a.violations, a.status, date].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
      body.appendChild(tr);
    });
  } catch (e) { showMessage(e.message, true); }
}

async function loadCompletedQuizzes() {
  const data = await api('/attempts/by-quiz');
  const list = $('completedQuizList');
  const attemptFilter = $('attemptQuizFilter');
  const leaderboardFilter = $('leaderboardQuizFilter');
  const currentAttempt = attemptFilter.value;
  const currentLeaderboard = leaderboardFilter.value;

  attemptFilter.innerHTML = '<option value="">All quizzes</option>';
  leaderboardFilter.innerHTML = '<option value="">All quizzes</option>';
  quizzes.forEach(q => {
    const o1 = document.createElement('option'); o1.value = q._id; o1.textContent = q.title; attemptFilter.appendChild(o1);
    const o2 = document.createElement('option'); o2.value = q._id; o2.textContent = q.title; leaderboardFilter.appendChild(o2);
  });
  attemptFilter.value = currentAttempt;
  leaderboardFilter.value = currentLeaderboard;

  list.innerHTML = data.quizzes.length ? '' : '<div class="empty-state">Abhi kisi quiz ka attempt nahi hua.</div>';
  data.quizzes.forEach(q => {
    const card = document.createElement('div'); card.className = 'quiz-admin-item completed-quiz-item';
    card.innerHTML = `<div><strong></strong><small>${q.attempts} attempt(s) · Average ${q.avgPercentage}% · Best ${q.bestPercentage}% · ${q.isPublished ? 'Published' : 'Unpublished'}</small></div><div class="item-actions"></div>`;
    card.querySelector('strong').textContent = q.title;
    const actions = card.querySelector('.item-actions');
    const view = document.createElement('button'); view.className = 'small-btn'; view.textContent = 'View Attempts'; view.onclick = () => {
      attemptFilter.value = q.quizId; loadStatsAndHistory(q.quizId); openAdminSection('resultsSection');
    };
    const board = document.createElement('button'); board.className = 'small-btn secondary-btn'; board.textContent = 'Leaderboard'; board.onclick = () => {
      leaderboardFilter.value = q.quizId; loadLeaderboard(q.quizId); openAdminSection('leaderboardSection');
    };
    actions.append(view, board); list.appendChild(card);
  });
}

$('attemptQuizFilter').addEventListener('change', e => loadStatsAndHistory(e.target.value));
$('leaderboardQuizFilter').addEventListener('change', e => loadLeaderboard(e.target.value));
$('refreshHistoryBtn').addEventListener('click', () => loadStatsAndHistory());
$('refreshResultsBtn').addEventListener('click', async () => { await loadQuizzes(); await loadCompletedQuizzes(); });

async function loadLeaderboard(quizId = $('leaderboardQuizFilter')?.value || '') {
  const path = quizId ? `/attempts/leaderboard?quizId=${encodeURIComponent(quizId)}` : '/attempts/leaderboard';
  const data = await api(path);
  const leaderboardHeading = $('leaderboardTitle') || $('pageTitle');
  if (leaderboardHeading) leaderboardHeading.textContent = quizId ? `Leaderboard — ${$('leaderboardQuizFilter').selectedOptions[0]?.textContent || 'Quiz'}` : 'Leaderboard';
  const body = $('leaderboardBody'); body.innerHTML = '';
  if (!data.leaderboard.length) { body.innerHTML = '<tr><td colspan="7">No attempts found.</td></tr>'; return; }
  data.leaderboard.forEach(r => { const tr = document.createElement('tr'); [r.rank, r.playerName, r.attempts, `${r.bestScore}%`, `${r.avgScore}%`].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }); body.appendChild(tr); });
}

async function loadAll() {
  try { await api('/auth/me'); await loadQuizzes(); await Promise.all([loadStatsAndHistory(), loadCompletedQuizzes(), loadLeaderboard()]); }
  catch (e) { logout(false); loginMessage(e.message); }
}

if (token) showDashboard(); else showLogin();

/* ===== v4 professional dashboard navigation + details ===== */
let editingQuestionIndex = -1;
const sectionMeta = {
  dashboardSection: ['Dashboard','Overview of your quiz platform.'],
  quizSection: ['Manage Quizzes','Create, edit, publish or remove quizzes.'],
  createSection: ['Create Quiz','Build your quiz and manage its questions.'],
  liveSection: ['Live Quiz','Start and monitor live tests in real time.'],
  resultsSection: ['Results & Attempts','Completed quizzes and every student attempt.'],
  leaderboardSection: ['Leaderboard','Top performers by quiz or across the platform.'],
  usersSection: ['Users','Manage registered students and accounts.']
};
function openEditorPanel(panelId){
  if (!panelId) return;
  document.querySelectorAll('.editor-panel').forEach(p=>p.classList.toggle('active-editor-panel', p.id===panelId));
  document.querySelectorAll('.editor-menu-item').forEach(b=>b.classList.toggle('active', b.dataset.editorPanel===panelId));
  const active=document.getElementById(panelId);
  if (active) active.scrollIntoView({behavior:'smooth', block:'start'});
}

function openAdminSection(id, focusPdf = false){
  document.querySelectorAll('.admin-section').forEach(s=>s.classList.toggle('active-section',s.id===id));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.section===id));
  const meta=sectionMeta[id]||['Dashboard','Overview of your quiz platform.'];
  $('pageTitle').textContent=meta[0]; $('pageSubtitle').textContent=meta[1];
  if (id === 'createSection') {
    openEditorPanel(focusPdf ? 'pdfPanel' : 'settingsPanel');
  }
}

document.querySelectorAll('.editor-menu-item').forEach(btn=>btn.addEventListener('click',()=>openEditorPanel(btn.dataset.editorPanel)));

document.querySelectorAll('.nav-item,[data-go]').forEach(el=>el.addEventListener('click',()=>{
  const id=el.dataset.section||el.dataset.go;
  openAdminSection(id, el.dataset.focusPdf === 'true');
  if (el.classList.contains('nav-item')) document.body.classList.remove('sidebar-open');
}));

// Professional auto-hide sidebar: move to the far-left edge to reveal it.
// The hamburger remains available so the menu is always reachable.
(function setupAdminSidebar(){
  const toggle=$('sidebarToggle'), overlay=$('sidebarOverlay');
  if(!toggle) return;
  const open=()=>document.body.classList.add('sidebar-open');
  const close=()=>document.body.classList.remove('sidebar-open');
  toggle.addEventListener('click',()=>document.body.classList.toggle('sidebar-open'));
  overlay?.addEventListener('click',close);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
})();

function renderQuestions() {
  $('questionCount').textContent = questions.length;
  if ($('editorQuestionCount')) $('editorQuestionCount').textContent = questions.length;
  $('questionList').innerHTML = questions.length ? '' : '<div class="empty-state">No questions added yet.</div>';
  questions.forEach((q, index) => {
    const item = document.createElement('div');
    item.className = 'question-item';
    item.dataset.questionIndex = index;

    const title = document.createElement('h3');
    title.innerHTML = `${index + 1}. ${formatMathText(q.question)}`;
    item.appendChild(title);

    const options = document.createElement('div');
    options.className = 'question-options';
    q.options.forEach((opt, oi) => {
      const el = document.createElement('div');
      el.className = 'question-option' + (oi === q.answer ? ' correct-option' : '');
      el.innerHTML = `${String.fromCharCode(65 + oi)}. ${formatMathText(opt)}`;
      options.appendChild(el);
    });
    item.appendChild(options);

    const actions = document.createElement('div');
    actions.className = 'question-actions';
    const edit = document.createElement('button');
    edit.className = 'small-btn';
    edit.textContent = '✏ Edit Here';
    edit.onclick = () => startInlineQuestionEdit(index);
    const del = document.createElement('button');
    del.className = 'small-btn delete-btn';
    del.textContent = 'Delete';
    del.onclick = () => {
      if (confirm('Delete this question?')) {
        questions.splice(index, 1);
        if (editingQuestionIndex === index) cancelQuestionEdit();
        renderQuestions();
      }
    };
    actions.append(edit, del);
    item.appendChild(actions);
    $('questionList').appendChild(item);
  });
}

function startInlineQuestionEdit(index) {
  const q = questions[index];
  const item = document.querySelector(`.question-item[data-question-index="${index}"]`);
  if (!q || !item) return;

  item.classList.add('question-inline-editing');
  item.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'inline-edit-heading';
  heading.textContent = `Edit Question ${index + 1}`;
  item.appendChild(heading);

  const question = document.createElement('textarea');
  question.className = 'inline-question-input';
  question.rows = 3;
  question.value = q.question;
  question.placeholder = 'Question';
  item.appendChild(question);

  const grid = document.createElement('div');
  grid.className = 'inline-options-grid';
  const optionInputs = [];
  q.options.forEach((opt, oi) => {
    const wrap = document.createElement('label');
    wrap.className = 'inline-option-field';
    const label = document.createElement('span');
    label.textContent = `Option ${String.fromCharCode(65 + oi)}`;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = opt;
    input.placeholder = `Option ${String.fromCharCode(65 + oi)}`;
    wrap.append(label, input);
    grid.appendChild(wrap);
    optionInputs.push(input);
  });
  item.appendChild(grid);

  const bottom = document.createElement('div');
  bottom.className = 'inline-edit-footer';
  const correctWrap = document.createElement('label');
  correctWrap.className = 'inline-correct-field';
  correctWrap.innerHTML = '<span>Correct Answer</span>';
  const correct = document.createElement('select');
  ['A', 'B', 'C', 'D'].forEach((letter, oi) => {
    const opt = document.createElement('option');
    opt.value = String(oi);
    opt.textContent = letter;
    correct.appendChild(opt);
  });
  correct.value = String(q.answer);
  correctWrap.appendChild(correct);

  const buttons = document.createElement('div');
  buttons.className = 'question-actions';
  const save = document.createElement('button');
  save.className = 'small-btn inline-save-btn';
  save.textContent = $('quizId').value ? '✓ Update & Save Here' : '✓ Update Here';
  const cancel = document.createElement('button');
  cancel.className = 'small-btn secondary-btn';
  cancel.textContent = 'Cancel';
  cancel.onclick = () => renderQuestions();
  buttons.append(save, cancel);
  bottom.append(correctWrap, buttons);
  item.appendChild(bottom);

  save.onclick = async () => {
    const updated = {
      question: question.value.trim(),
      options: optionInputs.map(input => input.value.trim()),
      answer: Number(correct.value)
    };
    if (!updated.question) return showMessage('Please enter the question.', true);
    if (updated.options.some(x => !x)) return showMessage('Please fill all four options.', true);

    save.disabled = true;
    save.textContent = 'Saving...';
    try {
      if ($('quizId').value) {
        const result = await api(`/quizzes/${$('quizId').value}/questions/${index}`, {
          method: 'PATCH',
          body: JSON.stringify(updated)
        });
        questions[index] = {
          question: result.question.question,
          options: [...result.question.options],
          answer: result.question.answer
        };
        showMessage(`Question ${index + 1} updated successfully.`);
      } else {
        questions[index] = updated;
        showMessage(`Question ${index + 1} updated. Save the quiz to publish it.`);
      }
      renderQuestions();
    } catch (e) {
      save.disabled = false;
      save.textContent = $('quizId').value ? '✓ Update & Save Here' : '✓ Update Here';
      showMessage(e.message, true);
    }
  };

  question.focus();
}

function startQuestionEdit(index){
  const q=questions[index]; editingQuestionIndex=index; $('questionEditorHeading').textContent=`Edit Question ${index+1}`;
  $('questionInput').value=q.question; ['A','B','C','D'].forEach((l,i)=>$(`option${l}`).value=q.options[i]||''); $('correctAnswer').value=String(q.answer);
  $('addQuestionBtn').textContent='✓ Update Question'; $('cancelQuestionEditBtn').classList.remove('hidden'); openAdminSection('createSection'); openEditorPanel('questionPanel');
}
function cancelQuestionEdit(){editingQuestionIndex=-1;$('questionEditorHeading').textContent='Add Question';$('addQuestionBtn').textContent='＋ Add Question';$('cancelQuestionEditBtn').classList.add('hidden');['questionInput','optionA','optionB','optionC','optionD'].forEach(id=>$(id).value='');$('correctAnswer').value='0';}
$('cancelQuestionEditBtn').addEventListener('click',cancelQuestionEdit);

// ===== BULK COPY/PASTE IMPORT =====
function parseAnswerKeyText(text) {
  const key = {};
  const source = String(text || '').replace(/\r/g, '');

  // 1) Explicit per-question answers, e.g. "Answer: B", "Ans - C",
  //    "Correct Answer: D". These are the most reliable source for Bulk Paste.
  const lines = source.split('\n');
  let currentQuestion = null;
  for (const raw of lines) {
    const line = raw.trim();
    const q = line.match(/^(?:Q(?:uestion)?\s*)?(\d+)\s*[.)-]\s*(.*)$/i);
    if (q) currentQuestion = Number(q[1]);
    const ans = line.match(/^(?:answer|ans|correct\s*answer|उत्तर|सही\s*उत्तर)\s*(?:key)?\s*[:=\-]\s*\(?\s*([ABCD])\s*\)?\s*$/i);
    if (ans && Number.isInteger(currentQuestion)) {
      key[currentQuestion] = 'ABCD'.indexOf(ans[1].toUpperCase());
    }
  }

  // 2) A separate answer-key section, e.g.:
  //    1(B), 2(A), 3(C) ... or 1-B, 2-A ...
  const marker = source.match(/(?:answer\s*key|answers?|उत्तर\s*कुंजी|उत्तर\s*तालिका)\s*:?/i);
  if (marker) {
    const region = source.slice(marker.index + marker[0].length);
    const re = /(?:^|[\s,;|])(?:Q\s*)?(\d{1,3})\s*[.):\-]?\s*\(?([ABCD])\)?/gi;
    let m;
    while ((m = re.exec(region))) {
      key[Number(m[1])] = 'ABCD'.indexOf(m[2].toUpperCase());
    }
  }
  return key;
}

function parseBulkQuestions(text) {
  const normalized = String(text || '').replace(/\r/g, '').replace(/\u00a0/g, ' ').trim();
  if (!normalized) return [];
  const answerKey = parseAnswerKeyText(normalized);
  const blocks = normalized.split(/\n\s*\n+/).map(x => x.trim()).filter(Boolean);
  const parsed = [];

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const lines = blocks[blockIndex].split('\n').map(x => x.trim()).filter(Boolean);
    if (lines.length < 5) continue;
    if (/^(?:answer\s*key|answers?|उत्तर\s*कुंजी|उत्तर\s*तालिका)/i.test(lines[0])) continue;

    const numberMatch = lines[0].match(/^\s*(?:Q(?:uestion)?\s*)?(\d+)\s*[.)-]\s*(.+)$/i);
    if (!numberMatch) continue;
    const questionNumber = Number(numberMatch[1]);
    const question = numberMatch[2].trim();

    const options = [];
    let localAnswer = null;
    for (const line of lines.slice(1)) {
      const ans = line.match(/^(?:answer|ans|correct\s*answer|उत्तर|सही\s*उत्तर)\s*(?:key)?\s*[:=\-]\s*\(?\s*([ABCD])\s*\)?\s*$/i);
      if (ans) {
        localAnswer = 'ABCD'.indexOf(ans[1].toUpperCase());
        continue;
      }
      const match = line.match(/^(?:\[\s*([A-Da-d])\s*\]|([A-Da-d]))\s*[.)\-:]?\s*(.+)$/);
      if (match) options.push({ letter: (match[1] || match[2]).toUpperCase(), text: match[3].trim() });
    }
    if (options.length !== 4) continue;
    const unique = new Set(options.map(x => x.letter));
    if (unique.size !== 4 || !question || options.some(x => !x.text)) continue;

    const sorted = options.sort((a,b) => 'ABCD'.indexOf(a.letter) - 'ABCD'.indexOf(b.letter));
    const answer = Number.isInteger(localAnswer)
      ? localAnswer
      : (Number.isInteger(answerKey[questionNumber]) ? answerKey[questionNumber] : 0);
    parsed.push({ question, options: sorted.map(x => x.text), answer });
  }
  return parsed;
}

function renderBulkPreview(items) {
  const msg = $('bulkMessage');
  if (!msg) return;
  msg.textContent = items.length ? `${items.length} question${items.length === 1 ? '' : 's'} parsed. Answer keys are applied when found; you can edit any answer before saving.` : 'No valid questions found. Use one question followed by A, B, C and D options.';
  msg.classList.toggle('error', !items.length);
}

$('parseBulkBtn')?.addEventListener('click', () => {
  const items = parseBulkQuestions($('bulkQuestionsInput').value);
  if (!items.length) { renderBulkPreview([]); return; }
  questions.push(...items);
  renderQuestions();
  $('bulkQuestionsInput').value = '';
  renderBulkPreview(items);
});
$('clearBulkBtn')?.addEventListener('click', () => { $('bulkQuestionsInput').value = ''; if ($('bulkMessage')) $('bulkMessage').textContent = ''; });

$('addQuestionBtn').addEventListener('click',()=>{
  const question=$('questionInput').value.trim(), options=[$('optionA').value.trim(),$('optionB').value.trim(),$('optionC').value.trim(),$('optionD').value.trim()], answer=Number($('correctAnswer').value);
  if(!question)return showMessage('Please enter the question.',true); if(options.some(x=>!x))return showMessage('Please fill all four options.',true);
  if(editingQuestionIndex>=0) questions[editingQuestionIndex]={question,options,answer}; else questions.push({question,options,answer});
  renderQuestions(); cancelQuestionEdit(); $('questionInput').focus();
});
$('newQuizBtn').addEventListener('click',()=>{resetEditor();openAdminSection('createSection');openEditorPanel('settingsPanel');});

async function showAttemptDetails(id){
  try{
    const data=await api(`/attempts/${id}`),a=data.attempt;$('attemptMeta').textContent=`${a.playerName} · ${a.quizName} · ${new Date(a.createdAt).toLocaleString()}`;
    let html=`<div class="attempt-summary"><div class="attempt-stat"><small>Score</small><strong>${a.score}/${a.total}</strong></div><div class="attempt-stat"><small>Percentage</small><strong>${a.percentage}%</strong></div><div class="attempt-stat"><small>Violations</small><strong>${a.violations}</strong></div><div class="attempt-stat"><small>Status</small><strong>${a.status}</strong></div></div>`;
    if(a.violationReasons?.length) html+=`<div class="attempt-question"><strong>Violation Reasons</strong><div class="answer-line">${a.violationReasons.map(x=>escapeHtml(x)).join('<br>')}</div></div>`;
    html+=a.details.map(q=>{const selected=q.selectedAnswer>=0?`${String.fromCharCode(65+q.selectedAnswer)}. ${formatMathText(q.options[q.selectedAnswer]||'')}`:'Skipped';const correct=`${String.fromCharCode(65+q.correctAnswer)}. ${formatMathText(q.options[q.correctAnswer]||'')}`;return `<div class="attempt-question ${q.result}"><strong>${q.number}. ${formatMathText(q.question)}</strong><div class="answer-line">Selected: <strong>${selected}</strong></div><div class="answer-line">Correct: <strong>${correct}</strong></div></div>`}).join('');
    $('attemptDetailBody').innerHTML=html;$('attemptModal').classList.remove('hidden');
  }catch(e){showMessage(e.message,true)}
}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
$('closeAttemptModal').addEventListener('click',()=>$('attemptModal').classList.add('hidden'));
$('attemptModal').addEventListener('click',e=>{if(e.target.id==='attemptModal')$('attemptModal').classList.add('hidden')});

const oldLoadStatsAndHistory=loadStatsAndHistory;
loadStatsAndHistory=async function(quizId=''){
  await oldLoadStatsAndHistory(quizId);
  document.querySelectorAll('#historyBody tr').forEach((tr,i)=>{
    const data=window.__lastAttempts?.[i]; if(!data)return;
    const td=document.createElement('td');const b=document.createElement('button');b.className='small-btn detail-btn';b.textContent='View';b.onclick=()=>showAttemptDetails(data._id);td.appendChild(b);tr.appendChild(td);
  });
};
const originalHistoryLoader=oldLoadStatsAndHistory;
/* capture the latest API result for View buttons */
loadStatsAndHistory=async function(quizId=''){
  try{
    const path=quizId?`/attempts?quizId=${encodeURIComponent(quizId)}`:'/attempts';
    const [stats,history]=await Promise.all([api('/attempts/stats'),api(path)]); window.__lastAttempts=history.attempts||[];
    $('statAttempts').textContent=stats.totalAttempts;$('statAverage').textContent=`${Number(stats.avgPercentage).toFixed(1)}%`;$('statViolations').textContent=stats.totalViolations;
    const body=$('historyBody');body.innerHTML='';$('historyTitle').textContent=quizId?`Attempts — ${$('attemptQuizFilter').selectedOptions[0]?.textContent||'Quiz'}`:'Quiz Attempts';
    if(!history.attempts.length){body.innerHTML='<tr><td colspan="7">No attempts found for this quiz.</td></tr>';return;}
    history.attempts.forEach(a=>{const tr=document.createElement('tr');const vals=[a.playerName,a.quiz?.title||'Deleted quiz',`${a.score}/${a.total} (${a.percentage}%)`,a.violations,a.status,new Date(a.createdAt).toLocaleString()];vals.forEach((v,idx)=>{const td=document.createElement('td');td.textContent=v;if(idx===4)td.innerHTML=`<span class="status-pill ${a.status==='auto-submitted'?'auto':''}">${escapeHtml(v)}</span>`;tr.appendChild(td)});const td=document.createElement('td');const b=document.createElement('button');b.className='small-btn detail-btn';b.textContent='View';b.onclick=()=>showAttemptDetails(a._id);td.appendChild(b);tr.appendChild(td);body.appendChild(tr)});
  }catch(e){showMessage(e.message,true)}
};

const oldLoadQuizzes=loadQuizzes;
loadQuizzes=async function(){await oldLoadQuizzes();};
const oldLoadAll=loadAll;
loadAll=async function(){await oldLoadAll();openAdminSection('dashboardSection');loadRecentAttempts();};
async function loadRecentAttempts(){try{const d=await api('/attempts');const body=$('recentBody');body.innerHTML='';(d.attempts||[]).slice(0,8).forEach(a=>{const tr=document.createElement('tr');[a.playerName,a.quiz?.title||'Deleted quiz',`${a.score}/${a.total} (${a.percentage}%)`,a.status,new Date(a.createdAt).toLocaleString()].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td)});body.appendChild(tr)});if(!d.attempts?.length)body.innerHTML='<tr><td colspan="7">No attempts yet.</td></tr>'}catch(e){}}


/* ===== PDF import controls ===== */
function syncPdfImportFields() {
  const mode = $('pdfImportMode')?.value || 'all';
  document.querySelectorAll('.pdf-first-count').forEach(el => el.classList.toggle('hidden', mode !== 'first'));
  document.querySelectorAll('.pdf-range-fields').forEach(el => el.classList.toggle('hidden', mode !== 'range'));
}
$('pdfImportMode')?.addEventListener('change', syncPdfImportFields);
syncPdfImportFields();

/* ===== V11 PDF IMPORT + USER MANAGEMENT ===== */
async function importQuestionsFromPdf() {
  const file = $('pdfQuestionFile')?.files?.[0];
  const msg = $('pdfMessage');
  if (!file) { if (msg) { msg.textContent = 'Select a PDF first.'; msg.classList.add('error'); } return; }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { if (msg) { msg.textContent = 'Only PDF files are supported.'; msg.classList.add('error'); } return; }

  const form = new FormData();
  form.append('pdf', file);
  const key = $('pdfAnswerKey')?.value.trim() || '';
  if (key) form.append('answerKey', key);

  const mode = $('pdfImportMode')?.value || 'all';
  form.append('importMode', mode);
  if (mode === 'first') form.append('questionCount', $('pdfQuestionCount')?.value || '50');
  if (mode === 'range') {
    form.append('startQuestion', $('pdfStartQuestion')?.value || '1');
    form.append('endQuestion', $('pdfEndQuestion')?.value || '50');
  }

  const button = $('parsePdfBtn');
  try {
    if (msg) { msg.classList.remove('error'); msg.textContent = 'Reading PDF and matching answers…'; }
    if (button) { button.disabled=true; button.textContent='⏳ Reading…'; }
    const data = await api('/quizzes/import-pdf', { method: 'POST', body: form });
    questions.push(...(data.questions || []));
    renderQuestions();
    const matched = Number(data.answerKeyMatched || 0);
    const unmatched = Math.max(0, Number(data.count || 0) - matched);
    if (msg) {
      msg.textContent = matched
        ? `✓ ${data.count} questions imported from ${data.totalDetected || data.count} detected. ${matched} correct answers matched automatically${unmatched ? `; ${unmatched} still need review` : ''}.`
        : `✓ ${data.count} questions imported from ${data.totalDetected || data.count} detected. No answer key was matched, so unmatched answers are set to A until you edit them.`;
    }
    $('pdfQuestionFile').value = '';
    if ($('pdfAnswerKey')) $('pdfAnswerKey').value = '';
  } catch (e) {
    if (msg) { msg.textContent = e.message; msg.classList.add('error'); }
  } finally {
    if (button) { button.disabled=false; button.textContent='⚡ Read PDF & Auto Answers'; }
  }
}
$('parsePdfBtn')?.addEventListener('click', importQuestionsFromPdf);

async function loadUsers() {
  try {
    const search = $('userSearchInput')?.value.trim() || '';
    const data = await api(`/players${search ? `?search=${encodeURIComponent(search)}` : ''}`);
    const body = $('usersBody');
    body.innerHTML = '';
    if (!data.players?.length) { body.innerHTML = '<tr><td colspan="7">No registered users found.</td></tr>'; return; }
    data.players.forEach(p => {
      const tr = document.createElement('tr');
      [p.name, p.email, p.attempts, `${Number(p.best || 0).toFixed(2)}%`, p.active ? 'Active' : 'Deactivated', new Date(p.createdAt).toLocaleString()].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
      const actions = document.createElement('td'); actions.className = 'item-actions';
      const toggle = document.createElement('button'); toggle.className = 'small-btn secondary-btn'; toggle.textContent = p.active ? 'Deactivate' : 'Activate'; toggle.onclick = () => toggleUser(p);
      const del = document.createElement('button'); del.className = 'small-btn delete-btn'; del.textContent = 'Delete'; del.onclick = () => deleteUser(p);
      actions.append(toggle, del); tr.appendChild(actions); body.appendChild(tr);
    });
  } catch (e) { showMessage(e.message, true); }
}
async function toggleUser(p) {
  const next = !p.active;
  if (!confirm(`${next ? 'Activate' : 'Deactivate'} ${p.name}?`)) return;
  try { await api(`/players/${p._id}/status`, { method: 'PATCH', body: JSON.stringify({ active: next }) }); showMessage(`User ${next ? 'activated' : 'deactivated'}.`); await loadUsers(); }
  catch (e) { showMessage(e.message, true); }
}
async function deleteUser(p) {
  const choice = confirm(`Delete ${p.name}?\n\nOK = Delete account only and PRESERVE attempt history.\nCancel = Keep the account.`);
  if (!choice) return;
  const deleteHistory = confirm(`Delete ${p.name}'s quiz attempts/results too?\n\nOK = Delete account + all history.\nCancel = Preserve history.`);
  try {
    await api(`/players/${p._id}?deleteHistory=${deleteHistory ? 'true' : 'false'}`, { method: 'DELETE' });
    showMessage(deleteHistory ? 'User and history deleted.' : 'User deleted. Attempt history preserved.');
    await loadUsers(); await loadStatsAndHistory();
  } catch (e) { showMessage(e.message, true); }
}
async function loadLegacyUsers() {
  try {
    const data = await api('/players/legacy');
    const body = $('legacyUsersBody');
    if (!body) return;
    body.innerHTML = '';
    if (!data.players?.length) { body.innerHTML = '<tr><td colspan="7">No legacy / guest players found.</td></tr>'; return; }
    data.players.forEach(p => {
      const tr = document.createElement('tr');
      [p.name, p.attempts, new Date(p.lastAttempt).toLocaleString(), p.blocked ? 'Suspended' : 'Active'].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
      const actions = document.createElement('td'); actions.className = 'item-actions';
      const toggle = document.createElement('button'); toggle.className = 'small-btn secondary-btn'; toggle.textContent = p.blocked ? 'Unsuspend' : 'Suspend'; toggle.onclick = async () => {
        try { await api(`/players/legacy/${encodeURIComponent(p.name)}/status`, { method: 'PATCH', body: JSON.stringify({ active: p.blocked }) }); showMessage(p.blocked ? `${p.name} unsuspended.` : `${p.name} suspended.`); await loadLegacyUsers(); } catch (e) { showMessage(e.message, true); }
      };
      const del = document.createElement('button'); del.className = 'small-btn delete-btn'; del.textContent = 'Delete'; del.onclick = async () => {
        if (!confirm(`Delete legacy user ${p.name}?`)) return;
        const deleteHistory = confirm('Delete this name\'s old quiz attempts/results too?\n\nOK = Delete history\nCancel = Keep history');
        try { await api(`/players/legacy/${encodeURIComponent(p.name)}?deleteHistory=${deleteHistory ? 'true' : 'false'}`, { method: 'DELETE' }); showMessage(deleteHistory ? `${p.name} and history deleted.` : `${p.name} removed; history preserved.`); await loadLegacyUsers(); await loadStatsAndHistory(); } catch (e) { showMessage(e.message, true); }
      };
      actions.append(toggle, del); tr.appendChild(actions); body.appendChild(tr);
    });
  } catch (e) { showMessage(e.message, true); }
}
$('refreshUsersBtn')?.addEventListener('click', loadUsers);
$('refreshLegacyBtn')?.addEventListener('click', loadLegacyUsers);
$('userSearchInput')?.addEventListener('input', (() => { let t; return () => { clearTimeout(t); t=setTimeout(loadUsers, 250); }; })());

const originalLoadAllV11 = loadAll;
loadAll = async function() {
  await originalLoadAllV11();
  await loadUsers();
  await loadLegacyUsers();
};

/* ===== DIRECT LIVE QUIZ ===== */
let directLiveQuestions = [];
function renderDirectLivePreview(){
  const el=$('directLivePreview'); if(!el)return;
  el.innerHTML = directLiveQuestions.length ? `<strong>${directLiveQuestions.length} questions ready.</strong> Answers detected automatically. Click Start Live Directly to launch without publishing.` : '';
  if($('directLiveMessage')) $('directLiveMessage').textContent = directLiveQuestions.length ? `${directLiveQuestions.length} questions parsed successfully.` : '';
}
$('parseDirectLiveBtn')?.addEventListener('click',()=>{
  const items=parseBulkQuestions($('directLiveQuestions').value);
  if(!items.length){if($('directLiveMessage'))$('directLiveMessage').textContent='No valid questions found. Use the same A/B/C/D + Answer format.';return;}
  directLiveQuestions=items; renderDirectLivePreview();
});
$('clearDirectLiveBtn')?.addEventListener('click',()=>{directLiveQuestions=[];$('directLiveQuestions').value='';renderDirectLivePreview();});
$('startDirectLiveBtn')?.addEventListener('click',async()=>{
  try{
    if(!directLiveQuestions.length){const items=parseBulkQuestions($('directLiveQuestions').value); if(items.length)directLiveQuestions=items;}
    const title=$('directLiveTitle').value.trim();
    if(!title)return showMessage('Enter a live quiz name.',true);
    if(!directLiveQuestions.length)return showMessage('Add and parse at least one question.',true);
    const duration=Number($('directLiveDuration').value||30);
    if(!Number.isInteger(duration)||duration<1||duration>180)return showMessage('Duration must be 1-180 minutes.',true);
    const result=await api('/live/direct',{method:'POST',body:JSON.stringify({title,subject:$('directLiveSubject').value.trim()||'General',topic:$('directLiveTopic').value.trim()||'General',duration,questions:directLiveQuestions,liveJoinOpenAfter:Number($('directLiveJoinOpenAfter')?.value||0),liveJoinCloseAfter:Number($('directLiveJoinCloseAfter')?.value||0),liveStartAfter:Number($('directLiveStartAfter')?.value||0),liveCloseAfter:Number($('directLiveCloseAfter')?.value||duration),showLiveScore:true,showLeaderboard:true})});
    liveBoardQuizId=result.quiz._id;
    showMessage('Live quiz started directly. It is NOT published.');
    await loadLiveQuizCards(); await loadLiveBoard(result.quiz._id);
    $('directLiveQuestions').value=''; directLiveQuestions=[]; renderDirectLivePreview();
  }catch(e){showMessage(e.message,true);}
});

/* ===== V17 LIVE CONTROL ===== */
let liveBoardQuizId = '';
let liveBoardTimer = null;

async function loadLiveQuizCards() {
  const wrap = $('liveQuizCards'); if (!wrap) return;
  try {
    const data = await api('/quizzes');
    wrap.innerHTML = '';
    const list = data.quizzes || [];
    if (!list.length) { wrap.innerHTML = '<div class="empty-state">Create a quiz first.</div>'; return; }
    list.forEach(q => {
      const card = document.createElement('article'); card.className = 'live-admin-card';
      const live = q.liveStatus === 'live';
      card.innerHTML = `<div class="live-card-top"><span class="subject-pill">${escapeHtml(q.subject || 'General')}</span><span class="live-status ${live?'is-live':''}">${live?'● LIVE':'○ READY'}</span></div><h3></h3><p>${escapeHtml(q.topic || 'General')} · ${q.questions?.length || 0} questions · ${q.time} min</p><div class="live-card-actions"></div>`;
      card.querySelector('h3').textContent = q.title;
      const actions = card.querySelector('.live-card-actions');
      if (live) {
        const monitor = document.createElement('button'); monitor.className='small-btn'; monitor.textContent='📊 Monitor'; monitor.onclick=()=>{liveBoardQuizId=q._id; openAdminSection('liveSection'); loadLiveBoard(q._id);};
        const end = document.createElement('button'); end.className='small-btn delete-btn'; end.textContent='■ End Live'; end.onclick=async()=>{if(confirm(`End live quiz “${q.title}”?`)){await api(`/live/${q._id}/end`,{method:'POST'}); await loadLiveQuizCards(); loadLiveBoard(q._id);}};
        actions.append(monitor,end);
      } else {
        const start = document.createElement('button'); start.className='small-btn live-start-btn'; start.textContent='🚀 Start Live'; start.onclick=async()=>{
          const duration=Number(prompt(`Live duration in minutes for “${q.title}”`, q.liveDuration || q.time || 30));
          if(!Number.isInteger(duration)||duration<1||duration>180)return;
          try { await api(`/live/${q._id}/start`,{method:'POST',body:JSON.stringify({duration,showLiveScore:q.showLiveScore!==false,showLeaderboard:q.showLeaderboard!==false})}); liveBoardQuizId=q._id; await loadLiveQuizCards(); await loadLiveBoard(q._id); }
          catch(e){showMessage(e.message,true);}
        };
        actions.append(start);
      }
      const monitorBtn=document.createElement('button'); monitorBtn.className='small-btn secondary-btn'; monitorBtn.textContent='Open'; monitorBtn.onclick=()=>{liveBoardQuizId=q._id;loadLiveBoard(q._id);}; actions.append(monitorBtn);
      wrap.appendChild(card);
    });
  } catch(e) { wrap.innerHTML='<div class="empty-state">Could not load live quizzes.</div>'; }
}

async function loadLiveBoard(id = liveBoardQuizId) {
  if (!id || !$('liveBoardBody')) return;
  liveBoardQuizId=id;
  try {
    const data=await api(`/live/${id}/admin-board`);
    $('liveBoardTitle').textContent=data.quiz.title;
    $('liveBoardMeta').textContent=`${data.quiz.subject || 'General'} · ${data.quiz.topic || 'General'} · ${data.quiz.liveStatus === 'live' ? 'LIVE NOW' : 'Not live'}`;
    $('liveParticipants').textContent=data.participants;
    $('liveActive').textContent=data.active;
    $('liveSubmitted').textContent=data.submitted;
    const body=$('liveBoardBody'); body.innerHTML='';
    if(!data.leaderboard.length){body.innerHTML='<tr><td colspan="7">No participants yet.</td></tr>';return;}
    data.leaderboard.forEach(r=>{const tr=document.createElement('tr'); [r.rank,r.playerName,`${r.score}/${r.total}`,r.answered,r.connection === 'online' ? '🟢 Online' : r.connection === 'offline' ? '🟠 Offline' : '⚫ Submitted',r.submitted?'Submitted':'Live'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);}); if(!r.submitted){const td=document.createElement('td'); const btn=document.createElement('button'); btn.className='small-btn delete-btn'; btn.textContent='Force Submit'; btn.onclick=async()=>{if(!confirm(`Force submit ${r.playerName}?`))return; const rowSession=r.sessionId; if(!rowSession)return; try{await api(`/live/${id}/session/${rowSession}/force-submit`,{method:'POST'}); await loadLiveBoard(id);}catch(e){showMessage(e.message,true);}}; td.appendChild(btn); tr.appendChild(td);} else {const td=document.createElement('td');td.textContent='—';tr.appendChild(td);} body.appendChild(tr);});
  } catch(e) { showMessage(e.message,true); }
}

$('refreshLiveBoardBtn')?.addEventListener('click',()=>loadLiveBoard());
document.querySelector('.nav-item[data-section="liveSection"]')?.addEventListener('click',()=>{loadLiveQuizCards(); if(liveBoardQuizId)loadLiveBoard(liveBoardQuizId);});
setInterval(()=>{if(document.getElementById('liveSection')?.classList.contains('active-section')){loadLiveQuizCards();if(liveBoardQuizId)loadLiveBoard(liveBoardQuizId);}},5000);
