# Campus Events

Campus event browsing and registration for the Advanced Development assignment.
Vue 3 frontend, Express 5 API, Sequelize, SQLite locally and PostgreSQL/Supabase in production.

## Run locally

Use Node.js 24 LTS (CI and Docker use this version), then:

```sh
npm ci
npm run dev
```

Open http://localhost:5173. The API runs on port 3000. An empty database receives demo events.
Optional settings go in api/.env; copy api/.env.example. Never commit credentials.
The default SQLite file is api/data/events.sqlite regardless of the working directory.

| Command | Purpose |
| --- | --- |
| npm run check | Lint, API tests and frontend tests |
| npm run build | Build the Vue frontend |
| npm start | Run the API and built frontend together |
| npm run seed | **Destructively reset** the configured database tables with demo data |

For a production-style local check, run npm run build and npm start, then visit http://localhost:3000.
The API serves the compiled frontend and handles Vue history URLs such as /stats.

## Backend structure

Requests follow routes → validation → controllers → services → repositories → models/database.

- api/src/config: environment validation and logging. Only env.mjs reads process.env.
- api/src/routes and validation: URL wiring and reusable Zod schemas.
- api/src/controllers: HTTP status codes and response formatting.
- api/src/services: event rules and background mail delivery; no Express or Sequelize imports.
- api/src/repositories: database queries, transactions, demo data and the mail outbox.
- api/src/models and db: table definitions and the configured connection.
- api/src/cache: bounded, expiring read cache with invalidation protection.
- api/src/mail: SMTP and HTTPS provider adapters.
- api/src/middleware and errors: consistent error responses and validation middleware.

Existing URLs, response bodies and error shapes are preserved. Full events now correctly reject
additional registrations. A unique event/email database index prevents duplicate subscriptions.
Mutations and live snapshots acquire a shared database lock, including seat checks and writes.
PostgreSQL uses a locked singleton row; local SQLite uses immediate transactions.
This also orders notification IDs by commit across instances.
Statistics use grouped registration counts rather than one registration query per event.

## Reliable confirmation email

Registration and its pending MailJob are saved in one database transaction. The HTTP request does
not contact the mail provider. If storing either row fails, neither is committed. Provider outages
therefore cannot undo an already successful registration.

The in-process worker polls persisted jobs every five seconds. Failure increments the attempt
counter and schedules exponential backoff, capped at one hour. Pending jobs survive restarts.
A new worker resumes delivery when the application starts again. Only one batch runs at a time.
Logs contain job IDs and attempt counts rather than recipient names, addresses or provider secrets.

Set RESEND_API_KEY and MAIL_FROM for HTTPS delivery through Resend. Alternatively set SMTP_URL
and MAIL_FROM for Nodemailer SMTP. HTTPS takes priority when both are configured. No extra SDK
is required for HTTPS. MAIL_FROM must be an address your provider allows to send.

Delivery is at least once: an SMTP acceptance followed by a process crash before recording success
can cause a duplicate email. Stable Message-ID values help identify retries, but do not guarantee
deduplication. Resend requests also use a stable idempotency key; its documented retention is 24 hours.
This is not a promise of exactly-once delivery. If no provider is configured, registrations still work
and messages remain queued. Configure a real provider before submission.

## GET caching

Event lists, event details and registration lists use a server-side in-memory cache. Statistics cache
their database inputs and calculate the time-dependent open/past status on each response. The health
endpoint deliberately checks the database every time instead of returning a cached success.

The default TTL is 30 seconds, with a maximum of 500 entries. Every successful event create, update,
delete or registration clears the cache after the transaction commits. Failed writes do not invalidate.
A generation counter prevents an older in-flight read from filling the cache after invalidation.
Values are cloned so callers cannot accidentally modify cached results. API responses use
Cache-Control: no-store to prevent independent browser/proxy caches hiding successful writes.

Each cached GET checks the latest committed notification ID. A change from another API instance
clears its local cache too. All ordinary writes must go through the application. Direct SQL edits
do not create notifications and can remain cached until TTL expiry.

## Assignment 2: MCP and live notifications

See [ASSIGNMENT-2.md](ASSIGNMENT-2.md) for the class explanation, client setup and demonstration steps.

The MCP endpoint is `/mcp`, using the official MCP SDK and stateless Streamable HTTP POST requests.
An MCP-compatible AI assistant discovers three tools:

- `get_upcoming_events`: events starting now or later, including IDs and remaining seats.
- `get_past_events`: events that have already started.
- `register_for_event`: an event ID and a `people` array of names/emails. Groups of up to 20
  succeed together or roll back together. The existing registration service validates capacity,
  prevents duplicate subscriptions and queues confirmation emails.

The assistant translates the user's sentence into tool arguments; the backend does not run a model
or need an AI API key. Configure an MCP client with `http://localhost:3000/mcp` locally or the public
website's `/mcp` URL after deployment. Different clients have different connection settings.
The endpoint rejects unapproved hostnames and cross-origin browser requests. Configure
`MCP_ALLOWED_HOSTS` for a different deployment hostname. Like the existing REST API, this classroom
demo has no user authentication; host/origin validation does not provide user authorization.

`GET /api/live` streams server-sent events to every connected browser. Committed event creations
and registrations are stored in a durable public notification log in the same transaction as the
write. Every API instance reads that log independently, so a shared queue cannot accidentally
send an update to just one instance. No extra broker account is required. The feed polls once per
second per active API instance, rather than once per browser: updates normally arrive within
about a second plus network/database time. It is near real time, not a zero-latency guarantee.

Registration notifications contain only the event ID/title, absolute registered/capacity/remaining
counts, type and permanent notification ID. No participant name, email or private MailJob payload
is published. Email retries do not create public notifications. Update/delete changes refresh
browser data without adding toasts. Event creation adds a `New event: ...` toast; registration adds
`Someone registered for Hack night — 2 seats left`.

Each new connection receives a consistent current snapshot and notification cursor. It starts at
that cursor and deliberately does not replay history. The browser discards duplicate/older IDs,
refreshes on visibility/network restoration, and detects suspension before accepting buffered
messages. A waking laptop therefore gets current seats without a backlog of old toasts.
This guarantees at most one displayed toast per committed notification during a live connection;
it does not guarantee an offline browser sees every registration. Reconnecting skips the offline
period by design. Seat counters use authoritative snapshots, never blind decrements.

The small-project tradeoff is a database-wide write lock and a growing log. This favors simple
correctness over high write throughput. A larger system would need log retention and a broker/
partitioning strategy. Existing email delivery remains at least once, as described above.

## Deploy: Render + Supabase

render.yaml prepares a free Node web service named campus-events-frosopatsalou. No deployment
has been created merely by adding this file. The final hostname depends on availability; retain a
name without the prohibited branding specified for this assignment.

1. After review approval, publish this project in your own GitHub repository.
2. Create or select a dedicated Supabase project. In Connect, copy the PostgreSQL **session pooler**
   URL (IPv4-compatible). URL-encode special characters in the database password.
3. In Render create a Blueprint from that repository. It builds with npm ci, npm run check and
   npm run build, then starts with npm start. Dependency installation uses
   npm ci --include=dev so production-mode hosting still installs the build/test tools.
   Checks explicitly use NODE_ENV=test
   so Vue's test utilities load their testing behavior. The free blueprint uses one instance.
   Multiple production instances must share the same PostgreSQL database. SQLite files are only
   shared in the local automated two-process test; do not use separate SQLite files on replicas.
   Seed demo data once before starting replicas, then set SEED_DEMO=false on each instance.
4. Enter DATABASE_URL, SMTP_URL and MAIL_FROM as private Render environment variables.
   For Brevo SMTP on Render Free, use port 2525 with requireTLS=true and URL-encoded
   SMTP login/key credentials. A Brevo SMTP key is different from an API key.
   Verify the sender address with the provider.
   RESEND_API_KEY remains an alternative HTTPS provider setting; leave it absent when using SMTP.
   These must never appear in frontend VITE_ variables, source control or public submission notes.
   Use a provider-verified sending domain/address that permits mail to the people testing the app.
   Resend's default testing sender has recipient restrictions; it is not unrestricted public email.
5. PostgreSQL uses verified TLS. If required, set DATABASE_CA_CERT to the Supabase CA certificate
   in PEM format. Do not disable certificate verification to work around certificate errors.
6. The application creates its tables inside campus_events, outside Supabase's default exposed
   public schema. Do not expose this schema through the Supabase Data API. The Vue browser only
   talks to Express; it receives no database credentials.
7. Check /api/health, list events, register using a real permitted recipient and verify receipt.
   Check updated seats and statistics. Restart the service and confirm the registration persists.

Render's free instance can sleep after inactivity, so first requests and queued mail may wait for
the instance to wake. SQLite is only for local development on this deployment: Render's free
filesystem is ephemeral. Supabase stores production registrations and mail jobs. Free-tier quotas
and inactivity policies still apply; check accounts before the teacher evaluates the application.

Dockerfile is an alternative for a Node-compatible host. Build with docker build -t campus-events .
and run with port 3000 exposed, private environment settings and (if using SQLite) a persistent
volume mounted at /var/data. Docker must be installed separately.

References: [Render Express deployment](https://render.com/docs/deploy-node-express-app),
[Render free limitations](https://render.com/docs/free),
[Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Nodemailer SMTP](https://nodemailer.com/smtp),
[Brevo SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP),
[Supabase TLS](https://supabase.com/docs/guides/platform/ssl-enforcement),
[Resend API](https://resend.com/docs/api-reference/emails/send-email),
[Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Assignment sources and submission

The Stack Overflow sources used and why are recorded in SOURCES.md.
SUBMISSION.md lists the required links and must be completed with actual URLs after publishing.
Do not submit planned URLs as working deployment links.

The original HTTP integration tests in api/tests/integration are unchanged. Additional tests cover
provider outages/retries, atomic rollback, duplicate registration races, final-seat contention,
cache expiry, invalidation after mutations, stale in-flight reads, time-sensitive statistics,
bounded cache storage, SMTP protocol delivery and HTTPS provider behavior.
New tests cover MCP discovery/tool execution/validation, group rollback, public payload privacy,
notification rollback, independent feed delivery, browser deduplication/wake behavior and HTTP/
stream ordering. A test starts two actual API processes against one temporary SQLite database,
opens both SSE streams, verifies cross-instance cache refresh and races the final seat.
That local test does not substitute for a PostgreSQL deployment test.
