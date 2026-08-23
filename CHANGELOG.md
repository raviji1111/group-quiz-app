# v20.3 fixed

- PDF importer now keeps English and Hindi in separate question fields and renders English first, Hindi directly below.
- Added OCR fallback for PDFs whose Hindi Unicode mapping is broken; Docker image includes Poppler + Tesseract Devanagari OCR.
- Added `questionEnglish` and `questionHindi` fields while keeping legacy `question` compatibility.
- Admin question editor supports separate English/Hindi editing.
- Added one-active-device session enforcement for player and admin accounts: a new login replaces the previous device session.
- Added server-side logout endpoints to invalidate the active session.

# Changelog

## V16
- Professional admin dashboard with polished hero, statistics and shortcut tiles.
- Sidebar is no longer permanently fixed open: it auto-hides and can be revealed from the left edge or with the menu button.
- Added a prominent `PDF → Quiz` workflow on the dashboard.
- PDF importer now accepts an optional answer-key string and automatically maps A/B/C/D answers.
- PDF parser recognizes `[A]`, `A.`, `A)`, `A:` style options and stops correctly at answer-key sections.
- Bulk paste importer can also apply answer keys when included in the pasted text.
- Existing inline question editing and fraction rendering are preserved.

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

## v15
- Fixed PDF-style mixed fraction rendering for plain copied text such as `33 1/3%`, `3 1/4%`, and `17 1/2%`.
- Kept support for older `\\frac{1}{3}` records.
- Applied the same fraction renderer to player questions/options and admin previews/question lists.
- Fixed admin question headings so mixed fractions render there too.

## V17 — Classy quiz hub + subject/topic + live quiz control
- Added manual Subject and Topic fields to every quiz.
- Added subject/topic grouping on the student quiz hub.
- Added a polished student-facing quiz catalog and live quiz area.
- Added live quiz start/end controls with configurable live duration.
- Added live score visibility and leaderboard visibility settings.
- Added admin live monitoring with participants, active sessions, submitted count and live ranking.
- Added student live score polling while a live quiz is in progress.
- Added live leaderboard on the result screen when enabled.
- Preserved existing PDF import, auto answer-key matching, inline question editing and mixed-fraction rendering.


## V18
- Fixed player hub layout so sections stack vertically instead of overlapping.
- Added a clean registration/login gate before quiz access.
- Quiz hub is hidden until a player registers or logs in.
- Added subject/topic browsing chips and cleaner topic-wise quiz cards.
- Added logout behavior from the player account button.
- Kept live quiz, live score, leaderboard, PDF import, answer key and mixed-fraction features intact.

## v20 — PDF import selection + bilingual preservation
- PDF → Quiz now supports importing all detected questions, first N questions, or a question-number range.
- PDF parsing now handles multiple A/B/C/D options appearing on the same line.
- English + Hindi text lines are preserved together in each imported question when the PDF exposes them as text.
- Fixed question-number detection so decimal values such as `12.75%` are not mistaken for question 12.
- Improved PDF import messages with detected/imported counts and answer-key matching.
- Added PDF import controls and language-preservation guidance to the admin UI.

## v20.1 — Bilingual PDF question line order
- PDF → Quiz now keeps English and Hindi question text on separate lines, with English first and Hindi immediately below.
- If a PDF extractor places English + Hindi on the same physical line, the importer splits them at the first Devanagari character.
- Player and admin question previews preserve the imported line break instead of collapsing both languages into one sentence.
- Existing A/B/C/D parsing, question selection and answer-key matching remain unchanged.
