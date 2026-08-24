/* LIVE #10 Admin Live Control: isolated force-submit action. */
window.LiveAdminControl = (() => {
  async function forceSubmit(sessionId, playerName){
    if(!sessionId || !confirm(`Force submit ${playerName || 'this participant'}?`)) return false;
    const token=localStorage.getItem('groupQuizAdminToken')||'';
    const res=await fetch(`/api/live/session/${encodeURIComponent(sessionId)}/force-submit`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message||'Could not force submit.');
    return data;
  }
  return {forceSubmit};
})();
