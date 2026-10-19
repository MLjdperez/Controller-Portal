# ML Controller Portal

Close, consolidation, subledgers and audit support for the Mama Lycha Group (MLB, MLF, MLL, GSA, LSA, ELIM).
Bilingual (EN/ES), with server-enforced roles and an append-only audit trail.

- Scope: [docs/MASTER_PROJECT_PROMPT.md](docs/MASTER_PROJECT_PROMPT.md)
- Decisions: [docs/CONTROLLER_PORTAL_HANDOFF.md](docs/CONTROLLER_PORTAL_HANDOFF.md) §0
- Assessment and plan: [docs/PHASE0_ASSESSMENT.md](docs/PHASE0_ASSESSMENT.md), [docs/PHASE0_PLAN.md](docs/PHASE0_PLAN.md)

## Status

Phase 1, backlog items 1–7. Built: scaffold, schema with its migration, seed, auth/scopes/audit, money library, EN/ES shell,
**Databook importer and statement engine**. Acceptance passed: portal statements tie to the Databook to the cent
(`docs/private/DATABOOK_FINDINGS.md` (local only: contains financial figures)).
Next: statements UI with drill-down, generic TB upload, approvals (items 8–11).

## Stack

Next.js 15 + TypeScript · PostgreSQL + Prisma 6 · decimal.js for money · Vitest · Railway.

## Run locally

Local Postgres (Docker), on port 5433 so it never collides with another project's database:

```bash
docker run -d --name controller-portal-db -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal_dev_only -e POSTGRES_DB=controller_portal -p 127.0.0.1:5433:5432 -v controller-portal-pgdata:/var/lib/postgresql/data postgres:16
```

Then:

```bash
npm install
cp .env.example .env        # DATABASE_URL must point at this portal's own database
npm run db:deploy           # apply migrations
npm run db:seed             # roles, entities, ownership, periods, first Controller
npm run dev
```

The seed writes the first Controller's initial password to `credentials.local.csv` (git-ignored).
Distribute it, then delete the file.

```bash
npm test                    # accounting and access-control unit tests
npm run typecheck
```

Load the Databook and check the portal against it:

```bash
npm run db:import:databook -- "<path>.xlsx" --through 2026-09 --as <controller email>
npm run db:verify:databook -- "<path>.xlsx"
DATABOOK_PATH="<path>.xlsx" npm test   # also runs the acceptance suite (skipped without the file)
```

## Data handling

Financial source files (Databook, TBs, FA registers) are **never committed**: `.gitignore` blocks
`*.xlsx`, `*.xls` and `*.csv` outside `test/fixtures` (which holds synthetic data only).
Uploaded originals are kept under `STORAGE_DIR`, addressed by SHA-256.
