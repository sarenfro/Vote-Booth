# Foster MBAA Voting Booth

Anonymous online voting platform for the University of Washington Foster School of Business MBA student association. Members vote on bylaw amendments, officer elections, and program initiatives.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080 in dev)
- `pnpm --filter @workspace/voting-booth run dev` — run the voting booth frontend (port 26150)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (`artifacts/api-server/`)
- DB: PostgreSQL + Drizzle ORM (`lib/db/`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API contract: OpenAPI 3.1 at `lib/api-spec/openapi.yaml`
- Codegen: Orval (React Query hooks + Zod schemas)
- Frontend: React + Vite + Tailwind + shadcn (`artifacts/voting-booth/`)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle schema (members, elections, election_options, voter_log, ballots)
- `lib/db/migrations/manual/voting_functions.sql` — cast_vote() and election_tally() Postgres functions
- `artifacts/api-server/src/routes/elections.ts` — all 9 elections API endpoints
- `artifacts/voting-booth/src/` — React frontend
- `lib/api-client-react/src/generated/` — auto-generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — auto-generated Zod schemas (do not edit)

## Architecture decisions

- **Anonymous ballot architecture**: The `voter_log` table records who voted (election_id + member_id); the `ballots` table records what was voted (no voter_id, no FK to members). These two tables are never JOINed. Anonymity is maintained at the application layer.
- **cast_vote() is the only write path into ballots**: The Postgres function atomically inserts into both voter_log (preventing double votes via UNIQUE constraint) and ballots. Direct ORM inserts into ballots are never used by application code.
- **election_tally() for read privacy**: Individual ballot rows are never exposed via API. All tally queries go through the election_tally() function which returns aggregate counts only.
- **Phase 1 auth is a placeholder**: The X-Member-Id request header carries member identity. A proper session/JWT system with @uw.edu enforcement ships in a later phase.
- **Admin check**: requireAdmin() looks up the isAdmin flag on the members table using the X-Member-Id header. No session/token; this is intentionally a placeholder for Phase 1.

## Security limitation (Phase 1 -- known)

The `cast_vote()` and `election_tally()` functions use `SECURITY DEFINER`, but if the Postgres role used by the app (DATABASE_URL) is a superuser, the database cannot enforce that ballots are only written via the function. The application code never issues direct ballot inserts, but the role restriction is not enforced at the DB level.

**Remediation for production** (before go-live):
1. Create a restricted app role: `CREATE ROLE mbaa_app LOGIN PASSWORD '...';`
2. Grant minimal permissions and `REVOKE ALL ON ballots FROM mbaa_app;`
3. Keep functions owned by a superuser role so SECURITY DEFINER elevates correctly.
4. Grant `EXECUTE ON FUNCTION cast_vote(...)` and `election_tally(...)` to mbaa_app.
5. Set DATABASE_URL to use mbaa_app credentials.

See `lib/db/migrations/manual/voting_functions.sql` for the full remediation steps.

## Product

- **Election list** (`/voting-booth/`) — members see open elections with Vote Now and recently closed elections with View Results
- **Ballot page** (`/voting-booth/:id`) — renders the correct UI for 4 vote types (yes/no, plurality, ranked-choice, multi-select); shows live tally after voting
- **Admin panel** (`/voting-booth/admin?admin=true`) — create elections with an options builder, open/close elections; admins see draft elections in the list
- **Member ID**: stored in localStorage and sent as `X-Member-Id` on all API requests

## User preferences

- No em dashes in comments or docs (use parentheses or commas instead)

## Gotchas

- After changing `lib/api-spec/openapi.yaml`, always run `pnpm --filter @workspace/api-spec run codegen` before editing routes or frontend hooks.
- The `lib/api-zod/src/index.ts` barrel is manually maintained (not generated). Only add `export * from "./generated/api";` there.
- Admin endpoints require X-Member-Id to match a member row with `is_admin = true`. Demo data has no admin members by default; seed one manually or add a seeding step.
- The voting booth frontend is at `/voting-booth/` (path-based routing). Do not hardcode root-relative API paths -- the Vite config sets `BASE_URL`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
