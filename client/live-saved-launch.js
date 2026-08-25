/* LIVE saved-quiz launch controls: dedicated UI for join/start/close timing. */
(function(){
  let currentQuiz = null;
  function ensureModal(){
    if(document.getElementById('savedLiveLaunchModal')) return;
    const style=document.createElement('style');
    style.textContent=`
      #savedLiveLaunchModal{position:fixed;inset:0;background:rgba(7,13,27,.62);backdrop-filter:blur(6px);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
      #savedLiveLaunchModal.show{display:flex}.saved-live-launch-card{width:min(680px,100%);background:#fff;border-radius:24px;padding:26px;box-shadow:0 30px 90px rgba(0,0,0,.25)}
      .saved-live-launch-card h3{margin:0 0 6px}.saved-live-launch-card p{color:#667085;margin:0 0 20px}.saved-live-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.saved-live-grid label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:800;color:#475467}.saved-live-grid input,.saved-live-grid select{width:100%;padding:10px;border:1px solid #d9e0ec;border-radius:10px}.saved-live-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}.saved-live-help{margin-top:12px;font-size:12px;color:#667085}@media(max-width:600px){.saved-live-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
    const modal=document.createElement('div'); modal.id='savedLiveLaunchModal';
    modal.innerHTML=`<div class="saved-live-launch-card"><span class="card-eyebrow">LIVE LAUNCH</span><h3 id="savedLiveLaunchTitle">Start saved quiz LIVE</h3><p>Set the timing for this LIVE run. The saved quiz itself will not be changed.</p><div class="saved-live-grid"><label>Quiz duration (min)<input id="savedLiveDuration" type="number" min="1" max="180"></label><label>Join opens after (min)<input id="savedLiveJoinOpen" type="number" min="0" max="180"></label><label>Join closes after (min)<input id="savedLiveJoinClose" type="number" min="0" max="180"></label><label>Quiz starts after (min)<input id="savedLiveStartAfter" type="number" min="0" max="180"></label><label>LIVE closes after (min)<input id="savedLiveClose" type="number" min="1" max="360"></label><label>Leaderboard<select id="savedLiveLeaderboard"><option value="on">Show</option><option value="off">Hide</option></select></label><label>Live score<select id="savedLiveScore"><option value="on">Show</option><option value="off">Hide</option></select></label></div><div id="savedLiveLaunchStatus" class="saved-live-help"></div><div class="saved-live-help">Example: Join 2 → Join closes 5 → Quiz starts 5 → LIVE closes 80 minutes after launch.</div><div class="saved-live-actions"><button id="savedLiveCancel" class="secondary-btn">Cancel</button><button id="savedLiveStart" class="live-start-btn">🚀 Start LIVE</button></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    document.getElementById('savedLiveCancel').onclick=close;
    document.getElementById('savedLiveStart').addEventListener('click',function(e){e.preventDefault();e.stopPropagation();launch();});
  }
  function open(q){ensureModal();currentQuiz=q;document.getElementById('savedLiveLaunchTitle').textContent=`Start LIVE — ${q.title}`;document.getElementById('savedLiveDuration').value=q.liveDuration||q.time||30;document.getElementById('savedLiveJoinOpen').value=q.liveJoinOpenAfter||0;document.getElementById('savedLiveJoinClose').value=q.liveJoinCloseAfter||0;document.getElementById('savedLiveStartAfter').value=q.liveStartAfter||0;document.getElementById('savedLiveClose').value=q.liveCloseAfter||q.liveDuration||q.time||30;document.getElementById('savedLiveLeaderboard').value=q.showLeaderboard===false?'off':'on';document.getElementById('savedLiveScore').value=q.showLiveScore===false?'off':'on';document.getElementById('savedLiveLaunchModal').classList.add('show');}
  function close(){document.getElementById('savedLiveLaunchModal')?.classList.remove('show');currentQuiz=null;}
  async function launch(){
    const status=document.getElementById('savedLiveLaunchStatus');
    const btn=document.getElementById('savedLiveStart');
    if(!currentQuiz){if(status)status.textContent='Please select a saved quiz again.';return;}
    const v=id=>Number(document.getElementById(id)?.value||0);
    const duration=v('savedLiveDuration'),joinOpen=v('savedLiveJoinOpen'),joinClose=v('savedLiveJoinClose'),start=v('savedLiveStartAfter'),closeAfter=v('savedLiveClose');
    if(!Number.isInteger(duration)||duration<1||duration>180){if(status)status.textContent='Quiz duration must be 1-180 minutes.';return;}
    if(joinClose<joinOpen){if(status)status.textContent='Join close must be after join open.';return;}
    if(start<joinClose){if(status)status.textContent='Quiz start must be at or after join close.';return;}
    if(closeAfter<=start){if(status)status.textContent='LIVE close must be after quiz start.';return;}
    const token=localStorage.getItem('groupQuizAdminToken')||'';
    if(!token){if(status)status.textContent='Admin session expired. Please login again.';return;}
    btn.disabled=true; btn.textContent='Starting LIVE…'; if(status)status.textContent='Starting LIVE…';
    try{
      const r=await fetch(`/api/live/${encodeURIComponent(currentQuiz._id)}/start`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({duration,liveJoinOpenAfter:joinOpen,liveJoinCloseAfter:joinClose,liveStartAfter:start,liveCloseAfter:closeAfter,showLiveScore:document.getElementById('savedLiveScore').value==='on',showLeaderboard:document.getElementById('savedLiveLeaderboard').value==='on'})});
      const text=await r.text(); let d={}; try{d=JSON.parse(text||'{}')}catch{}
      if(!r.ok)throw new Error(d.message||`Could not start LIVE (HTTP ${r.status}).`);
      if(!d.quiz?._id)throw new Error('LIVE started but server returned no quiz ID.');
      window.liveBoardQuizId=d.quiz._id;
      close();
      await window.loadLiveQuizCards?.();
      await window.loadLiveBoard?.(d.quiz._id);
      window.openAdminSection?.('liveSection');
    }catch(e){
      console.error('LIVE launch failed:',e);
      if(status)status.textContent=e.message||'Could not start LIVE.';
      alert(e.message||'Could not start LIVE.');
    }finally{btn.disabled=false;btn.textContent='🚀 Start LIVE';}
  }
  window.LiveSavedLaunch={open};
})();
