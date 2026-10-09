# v22 Render + GitHub deployment notes

- This package is based on the supplied `group-quiz-app-main(1).zip`.
- Render's existing `npm start` command is preserved; `package.json` now routes it to `server/server-v22.js`.
- The existing Dockerfile already uses `CMD ["npm", "start"]`, so no Dockerfile change is needed.
- Keep the existing Render environment variables (`MONGO_URI`, `JWT_SECRET`, and any app-specific secrets). Do not upload a local `.env` file.
- After GitHub commit, wait for Render auto-deploy and check Deploy Logs. Then verify `/api/health`, the main quiz page, `/admin`, `/admin-v22`, LIVE quiz and Todo.
- No live Render/MongoDB browser end-to-end test was possible in this build environment.
