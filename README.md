# Group Quiz App — Full Stack

This version upgrades the original LocalStorage prototype into a Node.js + Express + MongoDB application.

## Included
- Admin login with bcrypt password hashing + JWT authentication
- MongoDB quiz storage
- Quiz create/update/delete/publish APIs
- Player quiz loading without exposing correct answers in the public API
- Server-side score calculation
- Attempt history and basic dashboard statistics
- Existing fullscreen, timer, violation, warning sound and copy/paste restrictions
- Responsive UI

## Setup

1. Install Node.js 20+.
2. Create a MongoDB Atlas database and copy its connection string.
3. Copy `.env.example` to `.env` and fill in:
   - `MONGO_URI`
   - `JWT_SECRET`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
4. Open a terminal in this folder and run:

```bash
npm install
npm start
```

5. Open `http://localhost:3000/admin.html` for the admin panel.
6. Open `http://localhost:3000/` for the player quiz.

## Important security note
Browser anti-cheat controls (fullscreen, tab/blur detection, disabling copy/paste) are deterrents, not a perfect anti-cheat system. A browser cannot reliably prevent every form of cheating. The backend is responsible for the authoritative score and quiz data.

## API overview
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/quizzes/public`
- `GET /api/quizzes/:id/public`
- `GET /api/quizzes` (admin)
- `POST /api/quizzes` (admin)
- `PUT /api/quizzes/:id` (admin)
- `DELETE /api/quizzes/:id` (admin)
- `PATCH /api/quizzes/:id/publish` (admin)
- `POST /api/attempts`
- `GET /api/attempts` (admin)
- `GET /api/attempts/stats` (admin)

## Accounts and leaderboard
- Players can register/login or continue as guests.
- Logged-in player identity is attached to quiz sessions and attempts.
- Admin dashboard includes a global leaderboard based on best and average percentage.
## Player session recovery
If a player's saved JWT expires or becomes invalid (for example after a JWT secret change), the player page now clears the stale browser session and asks the player to log in again instead of remaining stuck on “Loading quizzes...”.

