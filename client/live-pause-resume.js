(function(){
 let paused=false, timer=null;
 async function poll(){const id=window.__activeLiveQuizId||window.__liveQuizId;if(!id)return;try{const r=await fetch(`/api/live/${id}/state`,{credentials:'include'});if(!r.ok)return;const d=await r.json();const next=!!d.paused;if(next!==paused){paused=next;document.dispatchEvent(new CustomEvent('live-pause-changed',{detail:{paused,announcement:d.announcement||''}}));}if(d.announcement)window.__liveAnnouncement=d.announcement; document.getElementById('liveAnnouncementBar')?.remove(); if(d.announcement && !d.paused){const b=document.createElement('div');b.id='liveAnnouncementBar';b.className='live-score-strip';b.textContent='📢 '+d.announcement;document.body.appendChild(b);}}catch(e){}}
 function start(id){window.__activeLiveQuizId=id;clearInterval(timer);poll();timer=setInterval(poll,3000);}
 function stop(){clearInterval(timer);timer=null;}
 function adminInit(){const section=document.getElementById('liveSection');if(!section||document.getElementById('phase3PauseBtn'))return;const b=document.createElement('button');b.id='phase3PauseBtn';b.className='small-btn';b.textContent='⏸ Pause LIVE';b.onclick=async()=>{const id=window.liveBoardQuizId;if(!id)return;const pause=b.dataset.paused!=='true';const r=await fetch(`/api/live/${id}/pause`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({paused:pause})});if(r.ok){b.dataset.paused=String(pause);b.textContent=pause?'▶ Resume LIVE':'⏸ Pause LIVE';}};const h=section.querySelector('.live-board-card .section-header');if(h)h.appendChild(b);}
 document.addEventListener('DOMContentLoaded',adminInit);
 document.addEventListener('live-pause-changed',e=>{const bar=document.getElementById('liveScoreStrip');if(bar){bar.classList.toggle('hidden',!e.detail.paused);bar.textContent=e.detail.paused?'⏸ LIVE paused by admin':(window.__liveAnnouncement||'');}});
 window.LivePauseResume={get isPaused(){return paused;},start,stop};
})();
