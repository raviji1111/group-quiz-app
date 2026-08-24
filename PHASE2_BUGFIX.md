# Phase 2 Bug Fix — v20.7.5

Fixes the LIVE manual submit flow on the final question.

- Final answer is saved before submission.
- Manual submit is allowed even if the exam monitoring warm-up has not completed.
- Quiz screen is replaced by the result screen after a successful submit.
- The dedicated live-submit-fix.js module remains isolated; no submit logic is duplicated in it.
