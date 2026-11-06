# Sources used

## Required Stack Overflow references

1. [Send mail as transactionally as possible](https://stackoverflow.com/questions/4013502/send-mail-as-transactionally-as-possible)
   — Used to examine why a database save and external email send cannot be treated as one ordinary
   database transaction. The implementation persists a mail job alongside the registration, then
   delivers asynchronously after commit. No answer code was copied.
2. [Cache invalidation algorithm](https://stackoverflow.com/questions/45118929/cache-invalidation-algorithm)
   — Used to identify the case where a slow read repopulates a cache after a write cleared it.
   The cache records a generation before loading and only stores the result if that generation
   is still current. A regression test reproduces this ordering. No answer code was copied.

## Primary implementation documentation

- [Sequelize transactions](https://sequelize.org/docs/v6/other-topics/transactions/)
  — Managed transactions commit both registration and outbox, or roll back both.
- [Sequelize setup](https://sequelize.org/docs/v6/getting-started/)
  — PostgreSQL drivers and URI connection configuration.
- [Nodemailer SMTP](https://nodemailer.com/smtp)
  — Transport URL and bounded connection/socket timeouts.
- [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
  — Session pooler and IPv4-compatible deployment connections.
- [Render free service limits](https://render.com/docs/free)
  — Ephemeral local storage, service sleeping and SMTP port restrictions.
- [Render Blueprint configuration](https://render.com/docs/blueprint-spec)
  — Deployment manifest fields.
- [Resend send email](https://resend.com/docs/api-reference/emails/send-email)
  — HTTPS request contract without adding an SDK.
- [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
  — Safe retries within the provider's documented 24-hour retention window.
