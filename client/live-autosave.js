/* LIVE #7 Auto-save Answers: isolated feature module. */
window.LiveAutoSave = (() => {
  let lastPayload = null;
  let pending = false;
  async function save(payload) {
    lastPayload = payload;
    pending = true;
    document.dispatchEvent(new CustomEvent('live-autosave-status',{detail:{status:'saving'}}));
    try {
      const token = localStorage.getItem('groupQuizPlayerToken') || '';
      const res = await fetch(`/api/attempts/session/${encodeURIComponent(payload.sessionId)}/progress`, {method:'PATCH',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(payload)});
      if (!res.ok) throw new Error('save failed');
      pending = false; document.dispatchEvent(new CustomEvent('live-autosave-status',{detail:{status:'saved'}}));
      return true;
    } catch (e) { pending = true; document.dispatchEvent(new CustomEvent('live-autosave-status',{detail:{status:'pending'}})); return false; }
  }
  async function retry(){ if(pending && lastPayload) return save(lastPayload); }
  return {save,retry,get pending(){return pending;}};
})();
