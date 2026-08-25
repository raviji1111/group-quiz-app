/* Reference UI v2: presentation layer only. No quiz/live API logic is changed. */
(function(){
  const $ = id => document.getElementById(id);

  function renderAdminReference(){
    const create = $('createSection');
    if(!create || create.querySelector('.reference-editor-stage')) return;

    const stage = document.createElement('div');
    stage.className='reference-editor-stage';
    stage.innerHTML = `
      <div class="reference-preview-card">
        <div class="reference-preview-head">
          <div><div class="reference-preview-title">Edit Quiz <span style="font-weight:400;color:#64748b">› Preview Question</span></div></div>
          <div class="reference-tools"><button type="button" class="secondary-btn" id="refBackQuiz">← Back to Quiz</button><button type="button" id="refSaveChanges">Save Changes</button></div>
        </div>
        <div class="reference-preview-question" id="refPreviewQuestion">7. Your question preview will appear here.</div>
        <div class="reference-preview-options" id="refPreviewOptions">
          <div class="reference-preview-option"><span class="letter">A</span>Option A</div>
          <div class="reference-preview-option"><span class="letter">B</span>Option B</div>
          <div class="reference-preview-option"><span class="letter">C</span>Option C</div>
          <div class="reference-preview-option"><span class="letter">D</span>Option D</div>
        </div>
        <div class="reference-preview-actions"><button type="button" id="refEditQuestion">Edit This Question</button><button type="button" class="danger-btn" id="refDeleteQuestion">Delete This Question</button><button type="button" class="secondary-btn" id="refShowAnswer">Show Answer</button></div>
      </div>
      <div class="reference-edit-card">
        <div class="reference-edit-title"><span>Edit This Question</span><small id="refQuestionId">Question ID: —</small></div>
        <div class="reference-question-form">
          <div class="form-group"><label>Question (English)</label><textarea id="refQuestionInput" rows="3"></textarea></div>
          <div class="form-group"><label>Question (Hindi)</label><textarea id="refQuestionHindi" rows="3" placeholder="Hindi question"></textarea></div>
          <div class="admin-grid">
            <div class="form-group"><label>Option A</label><input id="refOptionA"></div>
            <div class="form-group"><label>Option B</label><input id="refOptionB"></div>
            <div class="form-group"><label>Option C</label><input id="refOptionC"></div>
            <div class="form-group"><label>Option D</label><input id="refOptionD"></div>
          </div>
          <div class="form-actions"><button type="button" id="refUpdateQuestion">✓ Update Question</button><button type="button" class="secondary-btn" id="refOpenBuilder">Open Full Quiz Builder</button></div>
        </div>
      </div>`;
    create.insertBefore(stage, create.querySelector('.editor-workspace'));

    const copyFromOriginal = () => {
      const q = $('questionInput')?.value || '';
      $('refPreviewQuestion').textContent = q ? `7. ${q}` : '7. Your question preview will appear here.';
      const ids=['A','B','C','D'];
      ids.forEach((l,i)=>{ const v=$(`option${l}`)?.value || `Option ${l}`; const el=$('refPreviewOptions').children[i]; if(el) el.innerHTML=`<span class="letter">${l}</span>${escapeHtml(v)}`; const r=$(`refOption${l}`); if(r && document.activeElement!==r) r.value=v; });
      const rq=$('refQuestionInput'); if(rq && document.activeElement!==rq) rq.value=q;
    };
    const escapeHtml=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
    ['questionInput','optionA','optionB','optionC','optionD'].forEach(id=>$(id)?.addEventListener('input',copyFromOriginal));
    $('refOpenBuilder').onclick=()=>{ create.classList.add('reference-builder-open'); document.querySelector('[data-editor-panel="questionPanel"]')?.click(); };
    $('refEditQuestion').onclick=()=>document.querySelector('[data-editor-panel="questionPanel"]')?.click();
    $('refBackQuiz').onclick=()=>document.querySelector('[data-go="quizSection"]')?.click();
    $('refSaveChanges').onclick=()=>document.getElementById('saveQuizBtn')?.click();
    $('refUpdateQuestion').onclick=()=>document.getElementById('addQuestionBtn')?.click();
    $('refDeleteQuestion').onclick=()=>document.getElementById('clearQuestionsBtn')?.click();
    $('refShowAnswer').onclick=()=>{ const a=$('correctAnswer')?.value; if(a!=null) alert(`Correct answer: ${String.fromCharCode(65+Number(a))}`); };
    copyFromOriginal();
  }

  function playerLayout(){
    const quiz=$('quizScreen');
    if(!quiz) return;
    // Keep all existing quiz controls/functions; only arrange them to match the reference.
    const qn=$('questionNumber'), total=$('totalQuestions');
    if(qn && total){
      const top=quiz.querySelector('.quiz-top>div:first-child');
      const kicker=quiz.querySelector('.quiz-kicker');
      const counter=top?.querySelector(':scope > div');
      if(top && !top.querySelector('.ref-type')){
        const type=document.createElement('span'); type.className='ref-type'; type.textContent='Single Correct'; type.style.color='#fff'; top.appendChild(type);
      }
      const sync=()=>{ if(kicker) kicker.textContent='Q'+(qn.textContent||'1'); };
      sync();
      if(qn && !qn.dataset.refObserver){ const obs=new MutationObserver(sync); obs.observe(qn,{childList:true,characterData:true,subtree:true}); qn.dataset.refObserver='1'; }
      if(counter) counter.style.display='none';
    }
  }
  document.addEventListener('DOMContentLoaded',()=>{playerLayout(); renderAdminReference();});
  window.addEventListener('load',()=>{playerLayout(); renderAdminReference();});
})();
