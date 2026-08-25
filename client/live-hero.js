/* Player UX bug fix: move LIVE discovery directly under the welcome hero. */
(function(){
  function place(){const hub=document.getElementById('quizHubContent'),hero=hub?.querySelector('.player-hero'),live=document.getElementById('livePreview');if(!hub||!hero||!live)return;if(hero.nextElementSibling!==live)hero.insertAdjacentElement('afterend',live);live.classList.add('live-top-spotlight');const head=live.querySelector('.player-section-head h2');if(head)head.textContent='🔴 LIVE Now';const eyebrow=live.querySelector('.live-eyebrow');if(eyebrow)eyebrow.textContent='JOIN LIVE';}
  document.addEventListener('DOMContentLoaded',place);setTimeout(place,250);
})();
