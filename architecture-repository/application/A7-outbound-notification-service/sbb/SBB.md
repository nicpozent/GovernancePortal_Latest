# SBB — Graph sendMail (services/reminders.js)

_Solution Building Block realizing ABB **A7 Outbound Notification Service** in the Birgma Governance Portal._

## Realization
Sends from one mailbox; all interpolation HTML-escaped (M-2); no SMTP infra.

## Where it lives (code)
`apps/api/src/services/reminders.js (sendMail)`

## Maturity
Production-grade

## Alternative SBBs that could realize this ABB
SMTP relay, SendGrid/Mailgun.
