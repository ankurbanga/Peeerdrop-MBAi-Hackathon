# Peerdrop

Remember the person. Restart the conversation.

A mobile web prototype for reciprocal, selective contact exchange, a personal network graph, fragment search, private reminders/shared memories, and event interest. Built from `docs/PRD.md` and `docs/TECHNICAL_SPEC.md`.

## Run locally

Requires Node.js 22 or newer and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Until configured, the app shows setup instructions. It does not substitute browser-only contacts for the shared backend.

## Connect Supabase

1. Create a new **disposable demo** Supabase project.
2. In Authentication → Sign In / Providers, enable **anonymous sign-ins**. The exact dashboard label can vary; see the official anonymous-auth guide linked below.
3. Run `supabase/migrations/001_peerdrop.sql` in the Supabase SQL Editor. It creates all tables, RLS, service-only exchange RPCs, and fictional catalog/events.
4. Fill `.env.local` with your Supabase project URL, anon key, and **server-only** service-role key. Never put the service-role key in a `NEXT_PUBLIC_` variable or commit it.
5. Set `NEXT_PUBLIC_APP_URL=http://localhost:3000` for local use and `DEMO_MODE=true` for fixtures. Restart Next.js after changing environment variables.
6. Open two separate browser profiles or a regular/incognito pair. Each creates its own anonymous identity. Eight fictional contacts are attached idempotently to each real profile in demo mode. Set `DEMO_MODE=false` to stop attaching fixtures to newly saved profiles; existing demo records are not deleted.

The service-role client stays in server-only modules. Every application API request verifies its Bearer token with Supabase Auth. Browser roles cannot directly access app tables or transaction RPCs. QR tokens are random, hashed at rest, and expire after 15 minutes; the client removes them from the address bar after saving them to sessionStorage.

Natural-language people search works without extra configuration through deterministic matching. To enable model-ranked results, set `GEMINI_API_KEY` (or the server-only `AI_API_URL`, `AI_API_KEY`, and `AI_MODEL` variables for an OpenAI-compatible endpoint). The key never reaches the browser, and only direct connections plus details already shared with the viewer are eligible.

## Deploy for two phones

1. Import this project into Vercel as a Next.js app (or use another HTTPS Next.js host).
2. Add the five variables from `.env.example` in the host's environment settings. `SUPABASE_SERVICE_ROLE_KEY` and `DEMO_MODE` are server-only.
3. Set `NEXT_PUBLIC_APP_URL` to the final HTTPS deployment origin. Redeploy after changing public environment variables, which are bundled at build time.
4. Confirm anonymous sign-in and the migration on the same Supabase project used by deployment.
5. Open the deployment on both phones. A localhost QR cannot connect a second phone.

No deployment or Supabase project was created by this build. Physical-phone verification is still required.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Unit/domain tests include sharing, normalized AND search, filter/date behavior, consented graph edges, and event-interest rules. Embedded Postgres tests execute the migration and lifecycle RPCs. They omit only the pgcrypto extension declaration because UUID generation is built into the embedded engine. They do not substitute for hosted Supabase/Auth or concurrency testing.

Browser UI checks use **simulated API responses**, never a production mock mode. Start a separate test server with placeholder values, then run:

```sh
NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=browser-test-placeholder npm run dev
npx playwright install chromium
npm run test:e2e
```

Do not use these placeholders in your real `.env.local` or deployment. Tests cover mobile/desktop layout, retrieval, notes, event privacy controls, and invite onboarding. Screenshots are written to ignored `test-results/`.

After configuring a **disposable demo** backend, start the app with its real environment, then run:

```sh
node --env-file=.env.local scripts/integration-db.mjs
node --env-file=.env.local scripts/integration-api.mjs
node --env-file=.env.local node_modules/@playwright/test/cli.js test --config=playwright.live.config.ts
```

The first tests hosted transaction races/retries. The second creates three anonymous test users and checks actual API field omission, private/shared note authorization, graph revocation and event-interest consent. The live Playwright test uses two real browser identities plus a third unauthorized viewer, with no API interception. These checks clean temporary records and have not been run against Supabase without credentials.

## Prototype boundaries

- Browser sessions are identities. Clearing browser storage loses access; there is **no account recovery**.
- Shared cards are immutable snapshots; profile edits apply to future exchanges.
- Demo people, classes, clubs and sample events are fictional. Membership is self-selected.
- Event interest is not attendance or RSVP. Sharing interest is off by default.
- Campus and event integrations are manual selections and optional external links only. Seed events have no fabricated working RSVP links; add verified HTTPS links to the event configuration when available.
- Demo contacts use bundled, AI-generated fictional headshots; initials remain the fallback. Photo upload, messaging and background location are out of scope.
- CampusGroups and Kellogg directory content are clearly labeled simulated demo sources; no live campus account is connected.
- This is a hackathon prototype, not a production-readiness claim. Hosted integration tests and a physical two-phone rehearsal remain deployment prerequisites.

See `docs/DEMO.md` for the walkthrough and `PROGRESS.md` for verification status.

Official setup references: [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous), [Supabase API keys](https://supabase.com/docs/guides/api/api-keys), [Vercel environment variables](https://vercel.com/docs/environment-variables).
