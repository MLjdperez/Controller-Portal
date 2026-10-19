# ML Controller Portal

Close, consolidation, subledgers and audit support for the Mama Lycha Group (MLB, MLF, MLL, GSA, LSA, ELIM).
Bilingual (EN/ES), with server-enforced roles and an append-only audit trail.

- Scope: [docs/MASTER_PROJECT_PROMPT.md](docs/MASTER_PROJECT_PROMPT.md)
- Decisions: [docs/CONTROLLER_PORTAL_HANDOFF.md](docs/CONTROLLER_PORTAL_HANDOFF.md) §0
- Assessment and plan: [docs/PHASE0_ASSESSMENT.md](docs/PHASE0_ASSESSMENT.md), [docs/PHASE0_PLAN.md](docs/PHASE0_PLAN.md)

## Status

Phase 1, slice 1. Built: scaffold, core schema with its first migration, seed, auth/scopes/audit, money library, and the EN/ES shell with the TB-status dashboard.
Next: the Databook importer and the statement engine (backlog items 6–7).

## Stack

Next.js 15 + TypeScript · PostgreSQL + Prisma 6 · decimal.js for money · Vitest · Railway.

## Run locally

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

## Data handling

Financial source files (Databook, TBs, FA registers) are **never committed**: `.gitignore` blocks
`*.xlsx`, `*.xls` and `*.csv` outside `test/fixtures` (which holds synthetic data only).
Uploaded originals are kept under `STORAGE_DIR`, addressed by SHA-256.
