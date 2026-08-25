# v21.0.0 — Phase 4 complete (Advanced Security, Detailed Analytics, Live Performance Statistics)

New files only, existing behaviour untouched:
- `server/models/LiveAuditEvent.js` — append-only audit trail for LIVE admin actions.
- `server/middleware/liveSecurity.js` — per-identity rate limiting, ObjectId validation, hashed-IP helper.
- `server/services/liveAnalyticsService.js` — participant funnel, average/median/p90 scores, per-question correctness and option distribution.
- `server/routes/liveAnalytics.js` — `GET /api/live-analytics/:id` and `GET /api/live-analytics/:id/audit` (admin only).
- `client/live-performance.js` — live performance strip on the admin LIVE board, refreshed every 5s.

Improvements to existing LIVE flow:
- Pause/Resume now freezes the quiz clock: paused time is credited back to `liveEndsAt`, `liveJoinCloseAt` and `liveStartedAt`, and total paused time is stored.
- Pause is rejected unless the quiz is actually LIVE.
- Announcements strip `<`/`>` before storage; the client renders with `textContent`.
- Force-submit, pause/resume and announcements are rate limited and audited.
- Central JSON error handler and `404` handler for `/api/*`.

# v20.7.5
- Fixed LIVE student manual submit on the last question.
- Final answer is saved before submit.
- Prevented monitoring warm-up from blocking manual submit.
- Kept Phase 2 modules separate.

