/* Results bug fix: keep the selected quiz filter applied to table + summary stats + refresh. */
(function(){
  function bind(){
    const filter=document.getElementById('attemptQuizFilter');
    const refresh=document.getElementById('refreshResultsBtn');
    if(filter){filter.addEventListener('change',()=>window.loadStatsAndHistory?.(filter.value));}
    if(refresh){refresh.addEventListener('click',async()=>{await window.loadQuizzes?.();await window.loadCompletedQuizzes?.();await window.loadStatsAndHistory?.(filter?.value||'');});}
  }
  document.addEventListener('DOMContentLoaded',bind);
})();
