(function () {
  let soundOn = true;

  // Theme Toggle
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const html = document.documentElement;
      const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', next);
    });
  }

  // Sound Effects Toggle
  const soundBtn = document.getElementById('soundToggleBtn');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      soundOn = !soundOn;
      soundBtn.textContent = soundOn ? '🔊 SFX' : '🔇 Mute';
    });
  }

  function beep(freq = 520, duration = 0.05) {
    if (!soundOn) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  // 3D Tilt Physics on Cards
  function attach3DTilt() {
    document.querySelectorAll('.card-3d, .quiz-card, .todo-item').forEach((card) => {
      if (card.dataset.tiltReady) return;
      card.dataset.tiltReady = '1';
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const rx = (((e.clientY - r.top) / r.height) - 0.5) * -10;
        const ry = (((e.clientX - r.left) / r.width) - 0.5) * 10;
        card.style.transform = `perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(6px)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  // 3D Floating Particle Network Canvas
  const canvas = document.getElementById('bg-3d-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    window.addEventListener('resize', () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    });

    const pts = Array.from({ length: 45 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: Math.random() * 2 + 0.5,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6
    }));

    (function draw() {
      ctx.clearRect(0, 0, w, h);
      pts.forEach((p, i) => {
        p.x += p.vx * p.z;
        p.y += p.vy * p.z;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.z * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.55)';
        ctx.fill();

        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j];
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < 130) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(6, 182, 212, ${0.18 * (1 - d / 130)})`;
            ctx.stroke();
          }
        }
      });
      requestAnimationFrame(draw);
    })();
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('button, .btn-3d, .option-btn')) beep(560, 0.05);
  });

  attach3DTilt();
  new MutationObserver(attach3DTilt).observe(document.body, { childList: true, subtree: true });
})();
