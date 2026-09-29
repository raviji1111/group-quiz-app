/* Client-side safety layer: prevents duplicate writes while a daily save is in flight.
   Server-side validation remains authoritative and cannot be bypassed by this module. */
(() => {
  'use strict';
  const pending = new Set();
  window.TodoSecurity = {
    begin(id) { if (pending.has(id)) return false; pending.add(id); return true; },
    end(id) { pending.delete(id); },
    pending(id) { return pending.has(id); }
  };
})();
