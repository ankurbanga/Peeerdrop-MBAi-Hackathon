# Peerdrop — Codex implementation guide

## 1. Build contract

Read PRD.md first. Build a mobile web prototype from an empty repository, optimized for a reliable three-hour demonstration on two phones. BUSINESS_PITCH.md describes commercial hypotheses, not additional features to implement.

Required vertical slice: two authenticated browser sessions complete a reciprocal QR exchange, persist selected profile snapshots, appear on a graph, add private/shared memories, retrieve a contact using fragments, and see common context plus event links.

Do not substitute localStorage-only contacts for the shared backend. Do not add AI models, embeddings, live external account integrations, native apps, payments, or institution administration. Use simple deterministic behavior and fictional fixtures.

### Chosen stack

- Next.js App Router, TypeScript, Tailwind CSS; npm and a committed lockfile. Use current compatible stable package releases at scaffold time.
- Supabase Postgres and anonymous authentication for distinct persistent browser identities. Enable anonymous sign-in in the project. A browser session is an identity, not a globally selectable demo persona.
- Next.js Route Handlers for all application reads and mutations. Browser sends its Supabase access token as a Bearer token. Server verifies it with Supabase Auth; never trust a user ID supplied by the client.
- Server-only Supabase service-role client for application data; no direct browser table access. Enable RLS on every app table with no client-role policies, and explicitly authorize every server operation. This choice centralizes authorization for the short prototype; it does not make checks optional.
- React Flow (`@xyflow/react`) with custom avatar nodes and deterministic concentric-ring positions. Disable edge creation and node dragging; keep pan, zoom, fit, and selection.
- `qrcode.react` for QR rendering. Use the phone’s camera to open the URL; do not implement an in-app scanner.
- Zod for input validation, Vitest for business logic, and Playwright for the critical browser journey.
- Deploy to an HTTPS host supporting Next.js, with Vercel as the default. Two-phone acceptance requires a reachable deployment, not localhost. Hosting/account setup is an external prerequisite; request missing access without fabricating credentials.

Environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, server-only `DEMO_MODE`, and optional server-only `AI_API_URL`, `AI_API_KEY`, and `AI_MODEL`. Never expose service or AI keys through a public environment variable. Supply `.env.example` containing placeholders only.

Suggested source grouping: `src/app` for pages/routes; `src/components` for mobile screens; `src/lib/server` for auth, authorization and data services; `src/lib/domain` for pure graph/search/share functions; `supabase/migrations` and `scripts` for schema and fixtures. Keep service-role imports server-only.

## 2. Data model and access rules

All IDs are UUIDs unless stated otherwise. Store timestamps in UTC and render them in America/Chicago. Use database constraints, not only UI validation.

| Table                  | Essential columns and constraints                                                                                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`             | `id`, nullable unique `auth_user_id`, `display_name`, nullable `avatar_url`, required `graduation_year`, `details jsonb`, `default_share_fields text[]`, `graph_visible boolean default false`, `is_demo boolean default false`, timestamps. Non-demo rows require an auth owner; demo rows have no login. |
| `affiliations`         | `id`, `kind` in class/club, `name`; unique kind/name.                                                                                                                                                                                                                                                      |
| `profile_affiliations` | `profile_id`, `affiliation_id`; composite primary key.                                                                                                                                                                                                                                                     |
| `events`               | `id`, `title`, `starts_at`, `venue`, nullable `external_url`, `source` in partiful/campusgroups/curated, `tags text[]`, nullable `affiliation_id`, `is_demo`.                                                                                                                                              |
| `event_interests`      | `profile_id`, `event_id`, `share_with_connections boolean default false`; composite primary key. Absence means not interested.                                                                                                                                                                             |
| `exchanges`            | `id`, unique `token_hash`, `initiator_id`, nullable `receiver_id`, `status` in open/requested/accepted/cancelled, `expires_at`, `initiator_snapshot jsonb`, nullable `receiver_snapshot jsonb`, nullable `venue`, nullable `event_id`, nullable `connection_id`, timestamps.                               |
| `connections`          | `id`, canonically ordered `person_a`, `person_b`, `snapshot_a jsonb`, `snapshot_b jsonb`, `met_at`, nullable `venue`, nullable `event_id`, `is_demo`; unique person_a/person_b and check person_a < person_b.                                                                                              |
| `connection_favorites` | `profile_id`, `connection_id`, timestamp; composite primary key. This is private per viewer and never part of an exchanged snapshot.                                                                                                                                                                       |
| `notes`                | `id`, `connection_id`, `author_id`, `visibility` in private/shared, `body`, timestamps. Partial unique index on connection_id/author_id where visibility=private.                                                                                                                                          |

Profile detail keys: `hometown`, `industry`, `hobbies` (string array), `funFact`, and `contact` with optional phone/email/instagram/linkedin. Share fields are a fixed enum of those categories, individual contact keys, `classes`, and `clubs`. Do not accept arbitrary JSON field selectors. Sanitize retired fields from legacy data on read.

`SharedCard` contains `id`, `displayName`, `avatarUrl`, `graduationYear`, and only selected optional fields. `classes`/`clubs` contain catalog IDs and names. Generate cards server-side from the actor’s profile and validated selected fields. Omit withheld keys entirely. Name/photo/graduation year are always present as identity (photo may be null). Cards are immutable snapshots of an exchange; later profile changes affect future exchanges only.

Authorization matrix:

- Profile and affiliation writes: verified owner only. Full profile reads: owner only.
- Connection detail: participant only; return the other participant’s snapshot plus connection context, not their full profile.
- Pending exchange: initiator can see their own snapshot and receiver identity; receiver sees their own snapshot and initiator identity. No selected counterpart fields before acceptance.
- Shared notes: connection participants read; participants create as themselves; author alone edits/deletes.
- Private note: author alone reads/writes, and must be a connection participant. Exclude from counterpart responses and all third-party responses.
- Network edges between contacts: return IDs only after graph authorization; never expose their connection row, exchanged snapshots, venue, or notes.
- Event interest: owner sees their own; another user sees it only for a direct contact who set `share_with_connections=true`.
- Verify connection membership for every ID-based request. Knowing an ID or possessing a QR token is not authorization to read a profile.

## 3. API and exchange lifecycle

All `/api` routes require verified Bearer authentication, including invite preview; the client creates an anonymous session first. Return `{error:{code,message}}` for errors, with 400 validation, 401 unauthenticated, 403 forbidden, 404 missing, 409 conflict, and 410 expired where applicable. Do not include private values in logs. Limit text fields to 200 characters, fun facts to 500, notes to 2,000, and arrays to 20 entries. Trim text and enforce the limits on the server.

| Endpoint                                         | Request / response                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `GET /api/me`                                    | Full own profile, affiliations, defaults, and settings; null profile for a new session.             |
| `PUT /api/me`                                    | Validated own profile/defaults/affiliation IDs/settings; returns saved own profile.                 |
| `GET /api/catalog`                               | Classes, clubs, common hobby suggestions, and suggested venue labels.                               |
| `POST /api/exchanges`                            | `{shareFields, venue?, eventId?}` → `{id,url,expiresAt}`.                                           |
| `GET /api/exchanges/preview?token=...`           | Initiator name/photo, venue/event, lifecycle state and expiry only.                                 |
| `POST /api/exchanges/request`                    | `{token,shareFields}` → exchange ID and requested state; atomically claims receiver slot.           |
| `GET /api/exchanges/:id`                         | Participant-specific state, counterpart identity, and accepted connection ID if any.                |
| `POST /api/exchanges/:id/accept`                 | Initiator only; atomic completion → connection ID.                                                  |
| `POST /api/exchanges/:id/cancel`                 | Either current participant may cancel before acceptance.                                            |
| `GET /api/network`                               | `{self,contacts,edges}` with authorized searchable contact data described below.                    |
| `POST /api/search/ai`                            | `{query}` → validated direct-connection matches with concise reasons and fallback indicator.        |
| `GET /api/connections/:id`                       | Received card, date/venue, authorized notes and common affiliations.                                |
| `POST /api/connections/:id/notes`                | `{visibility,body}`; upsert own private note, or create shared entry.                               |
| `PUT /api/connections/:id/favorite`              | `{favorite}`; privately add or remove the connection from the authenticated viewer’s close network. |
| `PATCH /api/notes/:id` / `DELETE /api/notes/:id` | Author-only edits/deletion; visibility cannot be changed by edit.                                   |
| `GET /api/events`                                | Upcoming curated events, own interest, relevance and consented interested direct contacts.          |
| `PUT /api/events/:id/interest`                   | `{interested,shareWithConnections}`; delete row when uninterested.                                  |

Invite implementation:

1. Generate a cryptographically random 32-byte URL-safe token. Store only its SHA-256 hash, expire after 15 minutes. QR encodes `${APP_URL}/exchange#token=...`; read the fragment on the client and remove it from the address bar after saving to sessionStorage. Do not log request token values.
2. Save the initiator’s sanitized snapshot when issuing the invite. Preserve token through first-use onboarding.
3. On receiver request, reject self-exchange. In a transaction, lock the invite, validate expiry/status, and claim it for that receiver. A repeated request by that receiver is idempotent; another receiver gets 409. Store only that receiver’s sanitized snapshot.
4. Initiator polls every two seconds while the exchange screen is visible, sees who requested, and accepts or cancels.
5. Acceptance is one Postgres transaction/RPC: lock invite, verify actor is initiator and state is requested/unexpired, canonically order profile IDs, create the connection with correctly mapped snapshots, and mark invite accepted. Restrict RPC execution to the service role; pass only an actor ID derived from verified auth. Unique pair constraint prevents duplicates. Existing connections are returned without replacing prior snapshots/notes.
6. Repeated accept returns the stored connection ID even if the original invite has since expired. Cancelled/expired requests cannot subsequently become accepted. Cancellation and acceptance must lock the same row.
7. Receiver polls its exchange ID and opens the accepted connection on success. Stop polling when hidden, cancelled, accepted, or unmounted. Network failure shows retry and never creates a local success state.
8. Opening the initiator sheet creates an invite immediately from `default_share_fields`. Per-exchange edits debounce, cancel the prior open invite, and create a replacement; they do not mutate profile defaults.

Use two-second polling for the active invite and five-second polling for visible Network/detail/Events screens. Refetch after local mutations and when a tab regains focus. No realtime infrastructure is required.

## 4. Graph, search and events

`GET /api/network` returns self identity, direct contacts from accepted connections, and edges. Each contact includes connection ID, received snapshot, metAt/venue/event, authorized shared notes, only the viewer’s private note, visible current event interests, common affiliation IDs and visibility-safe mutual count. No raw counterpart profiles or unfiltered notes reach the client.

Graph algorithm: collect viewer’s direct contact IDs; always emit viewer-to-contact edges. For any accepted connection with both endpoints in this set, emit a contact-to-contact edge only if both endpoints’ current `graph_visible` values are true. Count mutuals from this filtered edge set. Viewer’s own visibility setting controls exposure to other viewers, not their ability to see their own connections.

Use a stable radial layout sorted by accepted date descending, then ID. Place self at origin, distribute contacts over rings of eight, and use increasing radius. Render the full authorized graph but initially frame self plus the newest 12; provide fit-all and recenter controls. Do not animate a force simulation or rebuild layout on each search. Selecting a result centers its node and opens the detail sheet.

Search: lowercase, normalize diacritics, split trimmed query on whitespace, and require every token to appear somewhere in that contact’s authorized text corpus. A token may match a substring. AND across filter categories and OR among selected values within a category. Date range is inclusive in Chicago local dates. Results sorted by most recent meeting. Active search and filters remove nonmatching contacts and their edges from the rendered graph and list. No query returns all contacts. No results shows a clear-filters action. Search/filter state persists when opening and closing sheets.

AI search is an explicit mode, not an automatic replacement for regular search. The server constructs candidates only from `GET /api/network`-authorized direct connections and excludes contact methods. Candidate text is treated as untrusted data. An OpenAI-compatible server-side endpoint may rank up to six IDs with reasons; unknown/duplicate IDs and blank reasons are discarded. Missing configuration, timeouts, non-success responses, or invalid output use deterministic keyword matching instead.

Filters remove nonmatching nodes and unrelated edges. Show a scrollable accessible result list whenever a query/filter is active, and offer a list toggle for browsing without graph gestures. Keyboard-focusable nodes, labeled buttons, visible focus states, and 44px touch controls are required.

Events: show future events by start date; optional “For you” filter requires at least one shared interest tag or affiliation with the viewer. Show the reason for relevance. Shared interest counts/names include direct contacts only and honor their current per-event sharing flag. A contact’s private interest never affects public counts. An event attached to a meeting does not create an interest or attendance record.

External URLs: accept only HTTPS for event/social links, validate protocols server-side, and open using `noopener noreferrer`. Construct phone/email actions from validated values. Sample events can have no link; hide the open action rather than inventing a working event URL. Real Partiful/CampusGroups links can be added to fixture config once supplied and verified.

## 5. Fixtures, screens and build order

Create roughly eight clearly fictional sample contacts with bundled fictional headshots, three sample classes, three clubs, several future sample events, and venue labels including Global Hub. Use initials when no image is available; photo upload is outside the time budget.

In server-controlled `DEMO_MODE`, an idempotent fixture service connects each newly created real demo profile to the same sample contacts using sample snapshots. Label these connections “Demo contact.” Fictional graph consent may be preconfigured; real users’ visibility stays off until they explicitly change it. Do not seed connections between real users or prefill their sensitive details. Demo fixtures must never run outside demo mode.

For the live story, person B manually enters industry “Healthcare” and hobby “Board games,” shares those fields, and both people choose the same seeded class. They each enable graph visibility for the demo. After they exchange, a triangle appears through one shared sample contact.

Screens: `/` Network; `/events`; `/me`; `/onboarding`; `/exchange` receiver flow; exchange creation/status as a sheet from the persistent Peerdrop action. Person detail and notes are sheets. Avoid overlapping sheets and preserve return context.

Visual direction: restrained purple accent, light background, clear typography, recognizable avatar nodes, low-contrast edges, minimal animation. Use safe-area padding for mobile navigation. Do not depend on hover. Content must make consent and private/shared note boundaries explicit.

Timeboxed order (target, not a delivery guarantee):

1. **0–25 minutes:** scaffold, schema, environment template, anonymous session, server auth, profile onboarding, hosted smoke check.
2. **25–75:** transactional exchange, QR, two-browser verification, persisted received cards. This is the critical path.
3. **75–115:** authorized network endpoint, radial graph, search/filter results and person sheet.
4. **115–145:** private/shared notes, venue capture, affiliations, Events with interest and external links.
5. **145–180:** fixtures, automated critical checks, phone layout fixes, deployed two-phone rehearsal.

If behind, simplify styling, use initials, and use a single filter sheet. Do not cut reciprocal consent, server authorization, real persistence, graph, search, or the Events tab. Document unfinished work rather than silently substituting fake behavior.

## 6. Verification and handoff

Automate domain tests for field allowlisting, snapshot ordering, AND-token search, filter combinations, graph visibility combinations, and event-interest visibility. Database/API integration checks must exercise access control and transactions against a test/demo database: concurrent acceptance, repeated requests, expiry, self-exchange, existing connection, and cancellation races.

Use two isolated browser contexts for the E2E exchange. A third context must fail to read notes/connection data by guessed ID. Assert recipient API responses omit withheld fields, pending counterpart snapshots, and private notes, not merely that the UI hides them. Confirm switching either graph endpoint off removes the edge and count on next fetch.

Run typecheck, production build, and the meaningful tests once after implementation; fix failures. Rehearse on two physical phones over HTTPS: scan QR, onboarding return, final accept, refresh persistence, fragment search, notes, graph triangle, shared class, Events and external link behavior. If physical phones or credentials are unavailable, clearly distinguish simulated browser checks from unverified phone acceptance.

Deliver working source, SQL migrations, fixture script, `.env.example`, lockfile, README setup/deploy instructions, and a concise demo script. README must state that anonymous sessions have no account recovery, profile snapshots do not auto-update, sample data is fictional, and campus/event integrations are links/manual selections only. No production-readiness claim.

### Codex starter prompt

> Implement Peerdrop from docs/PRD.md and docs/TECHNICAL_SPEC.md. Build the real two-session exchange first, then the graph-first mobile experience and Events tab. Follow the specified consent and server authorization rules. Use the chosen stack and fixtures, keep all secrets server-side, and do not add features from the business roadmap. Run the specified checks and report what works, what was actually tested, and any missing external setup. The build is intended for a three-hour hackathon demonstration.

### Official implementation references

- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers): HTTP endpoints in the App Router.
- [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous): browser identities and anonymous authentication setup.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): database access restrictions; anonymous authenticated users are distinct from the unauthenticated anon role.
- [React Flow custom nodes](https://reactflow.dev/learn/customization/custom-nodes): avatar-node rendering for the network view.
