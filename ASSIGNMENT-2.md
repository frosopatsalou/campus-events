# Assignment 2: explanation and review

Status: implemented locally. Do not describe these features as deployed until the approved push
and live checks have finished. The original public website URL is unchanged.

## What the assignment means

An MCP server gives an AI assistant a menu of actions it can call. The assistant understands the
sentence; our server does the actual work. For example, when asked to register two people, the
assistant first finds the event ID, asks for both people's names/emails, and calls our registration
tool. We reuse the same seat checks and email behavior as the ordinary website.

A toast is a short message in the corner of the website. A toast must arrive even when somebody
else registers from another browser. It must say which event changed, without identifying the
person who registered.

## Most important code

| File | What to explain in class |
| --- | --- |
| `api/src/mcp/server.mjs` | Three tools, their descriptions and Zod input schemas. The registration tool calls the existing service. |
| `api/src/mcp/routes.mjs` | Official MCP HTTP transport. A fresh stateless server handles each request, so requests can reach different instances. Host/origin checks reject unexpected browser requests. |
| `api/src/services/eventService.mjs` | Saves the registration, email job and anonymous notification together. A group is one transaction: either everyone fits or nothing is saved. |
| `api/src/repositories/eventRepository.mjs` | Database queries and shared locking. Two Node processes cannot both sell the same final seat. The latest log ID also invalidates caches across processes. |
| `api/src/models/index.mjs` | Notification table stores a permanent ID and public payload. ChangeLock supplies the shared PostgreSQL lock row. No existing event columns are altered. |
| `api/src/services/liveFeed.mjs` | Every API instance independently follows the shared log and broadcasts to its own connected browsers. One poll per second while clients are connected. |
| `api/src/controllers/liveController.mjs` | Keeps an HTTP response open using SSE. Sends snapshot/change/heartbeat messages and cleans up disconnected or slow clients. |
| `web/src/api/live.js` | Connects EventSource, ignores repeated IDs and restarts with a snapshot after a sleeping laptop wakes. Old connection callbacks cannot update the new connection. |
| `web/src/live/events.js` | Holds current event data and creates anonymous, dismissible seven-second toasts. |
| `web/src/components/EventToasts.vue` | Renders escaped text, an accessible announcement region and dismiss buttons. |
| `web/src/views/` | Applies live snapshots to event lists, seat counters and occupancy. Protects newer live results from older HTTP responses. |

## The flow in simple terms

1. A REST request or an MCP tool asks the service to register a person.
2. The database lock makes the seat check safe even with two API instances.
3. One transaction saves the registration, email job and anonymous notification.
4. Only after commit can the notification log readers see the new notification.
5. Both API instances read it. Each sends it to all browsers connected to that instance.
6. Each browser checks the notification ID, updates the seat count and shows one toast.
7. The separate email worker may retry sending mail. Those retries never write new notifications.

Example public notification:

```json
{
  "id": "12",
  "type": "registration.created",
  "eventId": 3,
  "title": "Hack night",
  "registered": 1,
  "capacity": 3,
  "spotsLeft": 2
}
```

There is no participant name or email in that message. Notification IDs are strings so large
database IDs are not rounded by JavaScript numbers.

## Why these choices?

- **SSE:** updates only need to travel from server to browser. EventSource already supports
  reconnecting, so a two-way WebSocket connection adds complexity this assignment does not need.
- **Shared database log:** works with the Supabase database already used by the website. A
  process-local event emitter would miss browsers connected to the second instance. A competing
  work queue would send each task to one consumer; this log is independently followed by both.
- **Atomic transaction:** avoids announcements for registrations that never successfully save.
- **Permanent IDs:** retries reuse the same logical notification. A browser's high-water mark
  ignores repeated IDs. Counts are absolute values, so a duplicate cannot subtract another seat.
- **Snapshot on reconnect:** the current database state matters after sleep. Replaying every old
  toast would be distracting, so the fresh snapshot sets a new baseline without historical toasts.
- **Database locking:** a JavaScript promise queue protects only one Node process. The database
  lock works across processes. For this small project, serializing writes is a clear tradeoff.
- **Shared service for MCP/REST:** there is one implementation of registration rules to maintain.

## MCP demonstration

Run `npm run build`, then `npm start`. The website and MCP server share port 3000.
Use an MCP client that supports remote Streamable HTTP, pointed at `http://localhost:3000/mcp`.
After deployment use `https://campus-events-frosopatsalou.onrender.com/mcp` instead.
Clients vary in how their connection settings are named. No MCP client has been configured
automatically and no external AI provider is needed by this backend.

Try these requests in that client:

1. “Get me all upcoming events.”
2. “Get me all past events.”
3. “Register me and another person for Hack night.” Supply names and email addresses when asked.

The registration tool arguments look like this (use an actual event ID and permitted test emails):

```json
{
  "eventId": 3,
  "people": [
    { "name": "First Person", "email": "first@example.com" },
    { "name": "Second Person", "email": "second@example.com" }
  ]
}
```

Do not register invented email addresses on the public deployment: production sends real emails.
The automated tests and local preview isolate their databases and disable real mail delivery.

## Browser demonstration

1. Open the local website in two browser windows.
2. Create an event with three seats. Both windows should show its creation toast.
3. Open that event in both windows. Register in one window.
4. Both show “Someone registered for ... — 2 seats left”. The other window's seat counter updates.
5. Switch away and return, or temporarily disconnect/reconnect. Seats refresh without old toasts.
6. Register the same email again: it is rejected and creates no additional notification.

## Verification and limits

Local verification on 22 November 2026: lint passed, 56 API tests and 18 frontend tests passed,
and the production build passed. An official MCP client successfully initialized, discovered
tools and called the server over HTTP. The rendered local frontend showed creation/registration
toasts and updated seats after a separate API request. Sleep and duplicate delivery were simulated
in automated tests; no physical laptop sleep was used as a test.

`npm run check` runs lint plus the existing and new tests. `npm run build` compiles the frontend.
The new two-instance test starts two real API processes, opens an SSE connection to each, races
the final seat and checks the second instance's warmed cache. It uses an isolated shared SQLite
file, not production Supabase. PostgreSQL locking still needs a live deployment verification.

The public `/mcp` endpoint has the same anonymous access model as the existing classroom REST API.
Host/origin checks are not a login system. The database log is retained indefinitely in this
small project. Global locking is suitable for a classroom demo, not maximum throughput. Updates
normally arrive in about one second, with additional network/database delays possible.

“One toast” means no duplicate toast for the same committed notification in an active stream.
An offline/reconnecting browser intentionally skips old notifications and receives current seats.
This is not a claim of exactly-once network delivery. Existing email remains at least once.

Dependency audit reports nine findings in the existing SQLite/Sequelize dependency trees,
including a critical tar advisory in SQLite's installation dependency chain. None is attributed
to the MCP SDK in the audit. A breaking database-library upgrade is outside this assignment;
no `npm audit fix --force` has been applied.

Before publishing, review this file and the diff. Commit/push and production testing are pending
the owner's approval. No secrets, production registrations or deployment settings were changed.
