/* ==========================================================
   UNIVERSAL 3D INTERACTIVE ENGINE & MODERN FEATURES
   ========================================================== */
(function () {
  // Ensure 3D theme is active immediately
  const savedTheme = localStorage.getItem('site_3d_theme') || 'cyber-dark';
  if (savedTheme !== 'classic') {
    document.documentElement.setAttribute('data-3d-theme', savedTheme);
  }

  let soundEnabled = localStorage.getItem('site_3d_sound') !== 'false';

  function playUiSound(freq = 520, duration = 0.06, type = 'sine') {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  // 3D Particle Network Canvas Background
  function init3DCanvas() {
    if (document.getElementById('bg-3d-canvas')) return;
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-3d-canvas';
    document.body.prepend(canvas);
    const ctx = canvas.getContext('2d');
    let w, h, particles = [];

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.7,
        vy: (Math.random() - 0.5) * 0.7
      });
    }

    function animate() {
      ctx.clearRect(0, 0, w, h);
      const isActive = document.documentElement.hasAttribute('data-3d-theme');
      if (isActive) {
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x += p.vx * p.z;
          p.y += p.vy * p.z;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.z * 1.8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(99, 102, 241, 0.65)';
          ctx.fill();

          for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j];
            const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
            if (dist < 140) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.strokeStyle = `rgba(6, 182, 212, ${0.22 * (1 - dist / 140)})`;
              ctx.stroke();
            }
          }
        }
      }
      requestAnimationFrame(animate);
    }
    animate();
  }

  // 3D Perspective Tilt on Cards
  function bind3DTilt() {
    const selectors = '.card, .quiz-card, .panel, .box, .todo-item, .task-card, .stat-card, .question-box';
    document.querySelectorAll(selectors).forEach((el) => {
      if (el.dataset.tiltBound) return;
      el.dataset.tiltBound = 'true';
      el.classList.add('tilt-3d-active');

      el.addEventListener('mousemove', (e) => {
        if (!document.documentElement.hasAttribute('data-3d-theme')) return;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const rotateY = ((x / rect.width) - 0.5) * 12;
        const rotateX = ((y / rect.height) - 0.5) * -12;
        el.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(8px)`;
      });

      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });
  }

  // Floating Control Dock (Theme, SFX)
  function injectModernHUD() {
    if (document.getElementById('modern-3d-dock')) return;
    const dock = document.createElement('div');
    dock.id = 'modern-3d-dock';
    dock.innerHTML = `
      <button id="toggle-3d-theme" title="Switch Theme">✨ Theme</button>
      <button id="toggle-3d-sound" title="Toggle Sound">${soundEnabled ? '🔊 SFX' : '🔇 Mute'}</button>
    `;
    document.body.appendChild(dock);

    function cycleTheme() {
      const current = document.documentElement.getAttribute('data-3d-theme') || 'classic';
      const next = current === 'cyber-dark' ? 'frosted-light' : current === 'frosted-light' ? 'classic' : 'cyber-dark';
      if (next === 'classic') {
        document.documentElement.removeAttribute('data-3d-theme');
      } else {
        document.documentElement.setAttribute('data-3d-theme', next);
      }
      localStorage.setItem('site_3d_theme', next);
      playUiSound(660, 0.08, 'triangle');
    }

    document.getElementById('toggle-3d-theme').addEventListener('click', cycleTheme);
    document.getElementById('toggle-3d-sound').addEventListener('click', (e) => {
      soundEnabled = !soundEnabled;
      localStorage.setItem('site_3d_sound', soundEnabled);
      e.target.textContent = soundEnabled ? '🔊 SFX' : '🔇 Mute';
      playUiSound(580, 0.06);
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    init3DCanvas();
    injectModernHUD();
    bind3DTilt();
    new MutationObserver(bind3DTilt).observe(document.body, { childList: true, subtree: true });
  });

  // Fallback if DOM already loaded
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init3DCanvas();
    injectModernHUD();
    bind3DTilt();
  }
})();
