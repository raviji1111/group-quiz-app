(function(){
  async function showLiveBoard(){
    const el=document.getElementById('resultLiveBoard');
    const liveId=window.__activeLiveQuizId || window.__liveQuizId || null;
    if(!el || !liveId) return;
    try{
      const r=await fetch(`/api/live/${encodeURIComponent(liveId)}/board`,{credentials:'include'});
      if(!r.ok) return;
      const d=await r.json();
      if(!d.quiz?.showLeaderboard){el.innerHTML='<p>Leaderboard is hidden for this LIVE.</p>';return;}
      const rows=d.leaderboard||[];
      el.innerHTML=`<div class="live-result-title">LIVE Leaderboard</div>`+(rows.length?`<ol>${rows.slice(0,10).map(x=>`<li><span>${escapeHtml(x.playerName)}</span><strong>${x.score}/${x.total}</strong></li>`).join('')}</ol>`:'<p>No leaderboard entries yet.</p>');
    }catch(e){}
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  window.showLiveBoard=showLiveBoard;
  window.LiveLeaderboard={show:showLiveBoard};
})();
