/* LIVE discovery bug-fix: keep discovery visible and make the LIVE spotlight compact. */
(function(){
  const style=document.createElement('style');
  style.textContent=`
    #livePreview.live-top-spotlight{margin-top:26px!important;padding:22px 24px!important;border-radius:24px!important;background:linear-gradient(135deg,#101a31,#162a52)!important;border:1px solid #263c67!important;box-shadow:0 16px 42px rgba(11,24,49,.14)!important;color:#fff}
    #livePreview.live-top-spotlight .player-section-head{align-items:center;margin-bottom:16px}
    #livePreview.live-top-spotlight .player-section-head h2{color:#fff;font-size:26px;margin:4px 0 0}
    #livePreview.live-top-spotlight .live-eyebrow{color:#ff6b7b!important}
    #livePreview.live-top-spotlight .secondary-btn{background:#43536d;color:#fff;border:0}
    #livePreview.live-top-spotlight .live-card-grid{grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}
    #livePreview.live-top-spotlight .live-player-card{background:#fff;border:1px solid #dfe6f2;border-radius:18px;padding:18px;box-shadow:none}
    #livePreview.live-top-spotlight .live-player-card h3{font-size:19px;margin:14px 0 6px}
    #livePreview.live-top-spotlight .live-empty{padding:18px;border:1px dashed #536887;color:#b8c4d8;background:rgba(255,255,255,.035)}
    #livePreview.live-top-spotlight .live-discovery-error{padding:18px;border-radius:16px;background:rgba(255,255,255,.06);color:#d9e3f3}
    @media(max-width:700px){#livePreview.live-top-spotlight{padding:18px!important}#livePreview.live-top-spotlight .player-section-head{align-items:flex-start}}
  `;
  document.head.appendChild(style);
  function decorate(){document.getElementById('livePreview')?.classList.add('live-top-spotlight');}
  async function reloadLive(){
    const wrap=document.getElementById('liveCards'); if(!wrap)return;
    if(!window.loggedPlayer || !window.playerToken){wrap.innerHTML='<div class="live-discovery-error">Please login to see LIVE quizzes.</div>';return;}
    try{const data=await window.api('/live/active');window.renderLiveCards(data.quizzes||[]);}catch(e){const msg=String(e?.message||'Please refresh.').replace(/[<>]/g,'');wrap.innerHTML=`<div class="live-discovery-error">LIVE could not be loaded. ${msg}</div>`;}
  }
  function install(){decorate();if(typeof window.loadLiveQuizzes==='function')window.loadLiveQuizzes=reloadLive;}
  document.addEventListener('DOMContentLoaded',install);setTimeout(install,100);setTimeout(decorate,500);
})();
