# SBB — quizzes + quiz_questions + quiz_attempts

_Solution Building Block realizing ABB **B3 Competency Verification** in the Birgma Governance Portal._

## Realization
Server-side grading (answers never trusted from client); capped attempts with an advisory-locked transaction.

## Where it lives (code)
`apps/api/src/routes.js (/policies/:id/quiz*)`

## Maturity
Production-grade
