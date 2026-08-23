(function () {
  const KEY = 'groupQuizDeviceId';
  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return 'gq-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
  }
  let id = localStorage.getItem(KEY);
  if (!id || id.length > 120) { id = createId(); localStorage.setItem(KEY, id); }
  window.GQDevice = { id, key: KEY };
})();
