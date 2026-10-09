'use strict';
// Loaded by the additive v22 server before page scripts. It binds a player account to one browser storage profile.
(() => {
  const DEVICE_KEY = 'groupQuizDeviceV22';
  const tokenKey = 'groupQuizPlayerToken';
  const nativeFetch = window.fetch.bind(window);
  let bindingPromise = null;
  let bindingError = null;
  let boundToken = '';
  function deviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`).replace(/[^A-Za-z0-9._:-]/g, '') + '-device-v22';
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }
  async function ensureBinding(token) {
    if (!token) return;
    if (boundToken === token && !bindingError) return;
    if (bindingPromise) return bindingPromise;
    bindingPromise = (async () => {
      try {
        const response = await nativeFetch('/api/v22/device/claim', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ deviceId: deviceId() })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'This account is bound to another device.');
        boundToken = token; bindingError = null;
      } catch (error) { bindingError = error; throw error; }
      finally { bindingPromise = null; }
    })();
    return bindingPromise;
  }
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const token = localStorage.getItem(tokenKey) || '';
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (token && url.startsWith('/api/') && !url.startsWith('/api/player/login') && !url.startsWith('/api/player/register')) {
      try { await ensureBinding(token); }
      catch (error) { window.dispatchEvent(new CustomEvent('groupquiz-device-error', { detail: { message: error.message } })); return new Response(JSON.stringify({ message: error.message, code: 'DEVICE_BINDING_FAILED' }), { status: 403, headers: { 'Content-Type': 'application/json' } }); }
      headers.set('X-Quiz-Device', deviceId());
    }
    return nativeFetch(input, { ...init, headers });
  };
  window.addEventListener('groupquiz-device-error', e => {
    let box = document.getElementById('v22DeviceWarning');
    if (!box) { box = document.createElement('div'); box.id = 'v22DeviceWarning'; box.style.cssText = 'position:fixed;z-index:99999;left:12px;right:12px;bottom:12px;padding:14px;background:#542a32;color:white;border:1px solid #ff9aa8;border-radius:12px;font:14px system-ui'; document.body.appendChild(box); }
    box.textContent = `${e.detail?.message || 'Device verification failed.'} Contact the administrator to reset the device binding.`;
  });
  // Complete initial binding after a player logs in, before their next protected request.
  const poll = () => { const token = localStorage.getItem(tokenKey) || ''; if (token && token !== boundToken && !bindingPromise) ensureBinding(token).catch(error => window.dispatchEvent(new CustomEvent('groupquiz-device-error', { detail: { message: error.message } }))); };
  poll(); setInterval(poll, 1000);
  async function showPlayerNotices() {
    const token = localStorage.getItem(tokenKey) || '';
    if (!token || !boundToken || bindingError) return;
    const host = document.body;
    if (!host || document.getElementById('v22PlayerNotices')) return;
    try {
      const results = await Promise.all([
        nativeFetch('/api/v22/notifications/mine', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : { notifications: [] }).catch(() => ({ notifications: [] })),
        location.pathname.endsWith('todo.html') ? nativeFetch('/api/v22/todos/reminders', { headers: { Authorization: `Bearer ${token}`, 'X-Quiz-Device': deviceId() } }).then(r => r.ok ? r.json() : { reminders: [] }).catch(() => ({ reminders: [] })) : Promise.resolve({ reminders: [] }),
        location.pathname.endsWith('todo.html') ? nativeFetch('/api/v22/todos/calendar', { headers: { Authorization: `Bearer ${token}`, 'X-Quiz-Device': deviceId() } }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null)
      ]);
      const notifications = results[0].notifications || [], reminders = results[1].reminders || [], calendar = results[2];
      if (!notifications.length && !reminders.length && !calendar) return;
      const box = document.createElement('section'); box.id = 'v22PlayerNotices';
      box.style.cssText = 'margin:12px auto;padding:14px;max-width:1100px;border:1px solid #7896c7;border-radius:12px;background:#16243a;color:#eef4ff;font:14px/1.5 system-ui';
      box.innerHTML = '<strong>Updates and reminders</strong>' + [...notifications.map(n => `<p><b>${String(n.title||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</b> — ${String(n.message||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</p>`), ...reminders.map(r => `<p>⏰ ${String(r.title||'Task').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))} is due ${r.due}${r.completedToday?' · completed today':''}.</p>`), ...(calendar ? [`<p>📅 ${calendar.month} consistency: ${calendar.summary.consistencyPercent}% · ${calendar.summary.completedTaskDays}/${calendar.summary.totalEligibleTaskDays} task-days completed.</p>`] : [])].join('');
      host.prepend(box);
    } catch (_) {}
  }
  document.addEventListener('DOMContentLoaded', () => setTimeout(showPlayerNotices, 1200));
})();
