/* LIVE #9 User Monitoring: isolated heartbeat module. */
window.LiveMonitoring = (() => {
  let timer=null, sessionId=null;
  async function heartbeat(){
    if(!sessionId || !navigator.onLine) return;
    const token=localStorage.getItem('groupQuizPlayerToken')||'';
    try{await fetch(`/api/live/heartbeat/${encodeURIComponent(sessionId)}`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});}catch{}
  }
  function start(id){stop();sessionId=id;heartbeat();timer=setInterval(heartbeat,5000);}
  function stop(){if(timer)clearInterval(timer);timer=null;sessionId=null;}
  return {start,stop};
})();
