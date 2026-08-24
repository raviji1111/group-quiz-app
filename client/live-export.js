(function(){
 function init(){const section=document.getElementById('liveSection');if(!section||document.getElementById('phase3ExportBtn'))return;const b=document.createElement('button');b.id='phase3ExportBtn';b.className='secondary-btn';b.textContent='⬇ Export LIVE Results';b.onclick=()=>{const id=window.liveBoardQuizId;if(id)window.open(`/api/live/${encodeURIComponent(id)}/export.csv`,'_blank');};const h=section.querySelector('.live-board-card .section-header');if(h)h.appendChild(b);}
 document.addEventListener('DOMContentLoaded',init);window.LiveExport={init};
})();
