/* LIVE #8 Connection Recovery: isolated network/retry module. */
window.LiveConnection = (() => {
  let online = navigator.onLine;
  function notice(text, error=false){
    const el=document.getElementById('playerMessage'); if(el){el.textContent=text;el.classList.toggle('error',error);}
    document.dispatchEvent(new CustomEvent('live-connection-status',{detail:{online:!error,text}}));
  }
  window.addEventListener('offline',()=>{online=false;notice('⚠ Connection lost. Your answers are being kept safely.');});
  window.addEventListener('online',async()=>{online=true;notice('✓ Connection restored. Syncing your answers…'); try{await window.LiveAutoSave?.retry();}finally{setTimeout(()=>notice('✓ Connection restored.'),1200);}});
  return {get online(){return online;}};
})();
