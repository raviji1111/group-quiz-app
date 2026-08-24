/* LIVE manual-submit bug fix module.
 * The actual submit remains in script.js; this isolated module only marks the
 * feature as installed and prevents duplicate submit handlers.
 */
window.LiveManualSubmitFix = Object.freeze({ enabled: true });
