# Upgrade completed

## Original prototype checked
- Admin quiz creation was stored in browser LocalStorage.
- Player loaded the same LocalStorage quiz.
- Timer, fullscreen, visibility/blur violations, warning sound, scoring and result screen were present.

## Upgraded
- Node.js + Express API
- MongoDB persistence
- bcrypt admin password hashing
- JWT admin authentication
- Admin dashboard and quiz manager
- Publish/unpublish
- Server-side quiz sessions and expiry time
- Server-side score calculation
- Attempt history and statistics
- Public quiz API does not include correct answers
- Admin-only endpoint exposes answers for editing
- Player quiz selection for multiple quizzes
- Existing anti-cheat deterrents retained
- Fixed warning audio filename in the packaged client (`warning.mp3`)

## Deliberate limitation
Browser anti-cheat controls cannot guarantee prevention of all cheating. They should be treated as deterrents, while the backend remains authoritative for quiz data and scoring.
