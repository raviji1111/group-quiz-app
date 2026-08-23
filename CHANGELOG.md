## v14 — PDF-style mixed-fraction rendering

- Fixed math display in both the admin question list and the user quiz screen.
- Legacy TeX such as `33\frac{1}{3}%` now renders as a compact PDF-style mixed fraction (33 with a stacked 1/3).
- Supports old records with one or multiple backslashes and optional TeX delimiters.
- Keeps the original question source unchanged inside edit fields.
- Removed the previous MathJax-dependent preview path to keep admin and player rendering consistent.

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

## v13 Final
- Registration/login is required before students can view or attempt quizzes.
- Registered users can be activated/deactivated or deleted by the admin.
- Legacy name-only players can be reviewed, suspended/unsuspended, or deleted from Users.
- Inline question editing updates a single live question directly from its question card.
- Correct-answer selection remains available in inline editing.
- Added MathJax rendering to the admin question preview and player question/options so LaTeX such as `\\(\\frac{x}{y}\\)` renders as a mathematical fraction instead of raw LaTeX text.
- Editable text fields continue to show the original LaTeX source so formulas remain easy to modify.
