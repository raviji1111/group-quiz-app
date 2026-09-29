# Todo Daily View v3

- Todo page shows only today's date/status; the long date history strip was removed.
- Every task remains visible with a Done/Not Done checkbox for today.
- Each task has its own Save button and today's optional note.
- Duration remains stored in MongoDB; each task can run for 1 day, 1 week, 1 month, 1 year, 90 days, or custom days.
- Server still accepts writes only for the server's current Todo date (Asia/Kolkata by default).
- Previous and future dates cannot be written through the API.
