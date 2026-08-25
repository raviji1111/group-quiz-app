(function(){
  function init(){
    const section=document.getElementById('liveSection'); if(!section||document.getElementById('phase3ResultControls'))return;
    const box=document.createElement('div'); box.id='phase3ResultControls'; box.className='admin-card'; box.innerHTML=`<div class="section-header"><div><span class="card-eyebrow">RESULT CONTROLS</span><h3>LIVE result visibility</h3></div><div><label>Score <select id="phase3ShowScore"><option value="on">Visible</option><option value="off">Hidden</option></select></label> <label>Leaderboard <select id="phase3ShowBoard"><option value="on">Visible</option><option value="off">Hidden</option></select></label> <button id="phase3SaveResult" class="small-btn">Save</button></div><p id="phase3ResultMsg" class="card-muted"></p></div>`;
    section.appendChild(box);
    document.getElementById('phase3SaveResult').onclick=async()=>{const id=window.liveBoardQuizId||'';if(!id)return;try{const token=localStorage.getItem('groupQuizAdminToken')||'';const r=await fetch(`/api/live/${id}/settings`,{method:'PATCH',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},credentials:'include',body:JSON.stringify({showLiveScore:document.getElementById('phase3ShowScore').value==='on',showLeaderboard:document.getElementById('phase3ShowBoard').value==='on'})});const d=await r.json();if(!r.ok)throw new Error(d.message);document.getElementById('phase3ResultMsg').textContent='Result settings saved.';}catch(e){document.getElementById('phase3ResultMsg').textContent=e.message;}};
  }
  document.addEventListener('DOMContentLoaded',init);
  window.LiveResultControls={init};
})();
