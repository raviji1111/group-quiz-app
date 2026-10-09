# Additive v22 upgrade notes

## What is included
- `server/server-v22.js`: separate entrypoint that reuses all v21 routes and adds v22 endpoints; original `server/server.js` is not changed.
- API rate limits, stricter login/register request limits, and one-browser-profile device binding for authenticated player API requests on the v22 entrypoint.
- Admin Plus page at `/admin-v22` using the existing admin login/token.
- User search, activate/suspend/delete, user quiz/Todo history, device binding reset, analytics, CSV export, announcements, audit log, JSON backup export, backup validation, transaction-based restore, and deep health checks.
- Player notifications and Todo deadline reminders are displayed by an injected client script on the main and Todo pages. Original HTML files are not edited; the v22 server injects the script into responses.
- Existing Quiz, LIVE, Todo, analytics, and auth route modules are reused unchanged.

## Run locally
1. Extract the full ZIP into a new folder.
2. Configure `.env` from `.env.example` with `MONGO_URI` and `JWT_SECRET`.
3. Run `node server/server-v22.js` from the project root (Node.js 20+).
4. Open `/admin-v22` for the additional admin page. `/admin` remains the original admin page.
5. Run tests: `node --test tests/v22/*.test.js`.

## Deployment
Set the deployment start command to `node server/server-v22.js` to activate the additive endpoints and device-binding middleware. The original package scripts and Render config are deliberately unchanged to preserve the current version. Do not replace the live deployment until staging tests pass.

## Device binding caveat
The device key is a browser-local identifier, not hardware attestation. Clearing browser storage or using a different browser can look like a new device; an admin reset endpoint is provided. It is a practical one-browser-profile restriction, not proof of a physical device identity.

## Backup and restore safety
- Exported backups contain app collections including user password hashes and personal progress. Keep them private and encrypted at rest.
- Validate checks the snapshot shape only.
- Restore requires the exact confirmation phrase `RESTORE ALL DATA`, replaces the listed app collections in a MongoDB transaction, and preserves Admin credentials.
- Restore requires MongoDB transaction support (normally a replica set). If the transaction is unavailable, it fails rather than falling back to unsafe partial restore.
- Always create and securely retain a fresh backup before restoring.

## Not claimed as production-verified
No live MongoDB connection or browser end-to-end run was available during this build. Automated pure-module tests and syntax checks are run; deploy to staging and exercise quiz join/start/submit, LIVE timing, Todo day rollover, notifications, device binding, analytics, backup and restore before production.
