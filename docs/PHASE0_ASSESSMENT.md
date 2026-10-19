# Phase 0 — Deliverable 1: Current State Assessment

Date: 2026-10-19. Read with `MASTER_PROJECT_PROMPT.md` and `CONTROLLER_PORTAL_HANDOFF.md` (§0 decisions win).

## 1. What was inspected

| Item | Status |
|---|---|
| `MLjdperez/Controller-Portal` (this repo) | Inspected. Empty at creation; now holds docs only. |
| `MLjdperez/ML-Group-Corporate-Budget` (local clone, `~/dev`) | Inspected **read-only**: README, package.json, Prisma schema (1,970 lines, ~70 models), 9 migrations, `railway.json`, `src/lib` layout, auth. Not modified. It has uncommitted changes, which belong to that project. |
| Railway project, environment variables, database connectivity | **Unverified.** No access from here. |
| Datarails integration (`scripts/sync-datarails.cjs` in the budget app) | Seen by name only. Not reviewed. |
| Existing FA / intangible / lease work | **No code exists.** The work so far is the Excel data layer and the architecture decision doc (handoff §4–5). |
| Databook `MLF Group Trial Balances 2026 (Databook Post Audit).xlsx` | Described in the handoff. Not yet opened by this session. |

## 2. What already exists

The master prompt's "existing project" (Next.js/TS, Prisma, Railway, bilingual, multi-entity, approvals,
audit trail) matches **ML-Group-Corporate-Budget**, a budgeting/forecasting portal, not a controller portal:

- **Stack:** Next.js 15, React 19, TypeScript, Prisma 6 / PostgreSQL, zod, exceljs, bcryptjs. Railway via Nixpacks;
  `prisma migrate deploy` runs on start. No test runner.
- **Auth:** email + password, bcrypt, sessions stored as SHA-256 token hashes, lockout after 5 failures,
  forced password change, `UserScope` grants by entity / cost center (empty scope = no access, never all).
- **Reusable models:** `Entity` (parent tree, `ownershipPct`, `currency`, `sageCompanyCode`), `GlAccount`
  (`isIntercompany`, local and Spanish names), `Period`, `ExchangeRate` (rate types), `AuditLog` (before/after JSON),
  `UploadBatch` / `UploadRow` / `ValidationIssue` (checksum, preview-then-commit), `ApprovalRule` / `ApprovalRequest`,
  `Task`, `Notification`, `FactGl` (GL actuals per entity/period/account).
- **Libraries:** `consolidation.ts`, `statements.ts`, `i18n.ts`, `approval.ts`, `lock.ts`.

## 3. Gaps against the Controller Portal scope

These are budget-shaped and don't meet the controller requirements as they stand:

- **No journal entry engine**: no JE header/lines, posting destination, or Proposed → Approved → Exported → Posted.
- **No trial balance submission model.** `FactGl` holds an amount per account; it has no source account, debit/credit,
  signed convention, translation fields or versioned submission.
- **No standardized chart of accounts / source-to-standard mapping.** `GlAccount` is per entity, with a budget category.
- **No ELIM entity, intercompany matching, close checklist, documents, PBC, tax, FA/intangibles/leases or auditor role.**
- `Entity.ownershipPct` is not effective-dated or approved.
- No automated tests, which the prompt (§25) requires for accounting calculations.

## 4. Conflicts found — need the Controller

| # | Topic | Budget app | Master prompt / handoff | Proposed resolution |
|---|---|---|---|---|
| C1 | Entity codes | MLG, MLF, MLL, GOT, LUN | MLB, MLF, MLL, GSA, LSA, ELIM | Portal uses the master-prompt codes. Keep a code cross-reference so budget data can be compared later. |
| C2 | Parent | MLG "ML Group (consolidation parent)" | MLB "ML Buyer", a legal entity with native JEs, plus ELIM as a separate consolidation-only entity | Use MLB + ELIM. |
| C3 | Lunic | "Lunic S.A. de C.V.", country SV, "USD — confirm" | "Lunic SA", functional currency NIO (D4) | **Resolved 2026-10-19: Lunic SA, Nicaragua, NIO.** The budget app's record is out of date. |
| C4 | Ownership chain | All direct children of MLG | MLB → MLF → {MLL, GSA, LSA} | Use the master-prompt chain (D3). |

## 5. Repository and database strategy — **confirmed by the Controller 2026-10-19**

**Build the Controller Portal as its own app with its own database, in this repo, porting the budget app's proven pieces
rather than starting from a blank page.**

Why not extend the budget app in place:
- Different control environment: external auditors, period locks over actuals, JE posting status. Mixing that with
  ~25 budget submitters raises the authorization risk on both sides.
- The budget app has a live cycle (entry opens 14 Nov, locks 31 Dec 2026). Large schema changes there now put that
  deadline at risk, and the prompt forbids risky migrations on working systems.
- Its data shapes (scenarios, submissions, facts) are planning concepts. The portal needs ledger concepts.

What to port (copy and adapt, with attribution in commit messages):
- `auth.ts` session design, lockout and scope model, plus `AuditLog`.
- The upload pipeline: `UploadBatch` → rows → `ValidationIssue` → preview → commit, with checksum duplicate detection.
- The i18n approach (stable codes, EN/ES labels), `railway.json`, and the migration scripts / `DEPLOY.md` discipline.

Later link: once the portal is the system of record for group actuals and the standardized COA, the budget app can read
actuals from it for variance reporting. That replaces the budget app's own `FactGl` loads. It is not part of Phase 1.

## 6. Risks

1. **Two masters for entities and COA** until the link above exists. Mitigation: the portal owns the group COA, and the code cross-reference (C1) is a seeded table.
2. **Sensitive data in git.** The Databook and FA files must never be committed. Imports read from a local path or an upload, and `.gitignore` blocks `*.xlsx` outside `test/fixtures` (which hold synthetic data only).
3. **LSA translation is unresolved.** Phase 1 reproduces the Databook as given (its LSA columns appear to be already in USD). The NIO translation engine is Phase 2.
4. **The Railway environment is unverified.** Phase 1 needs a new Railway service plus a Postgres database (dev and prod) and file storage for originals (a Railway volume or S3-compatible bucket).
5. **Visual Integrator license** for Sage 100 JE import is unconfirmed (handoff §6). It doesn't block Phase 1.

## 7. Proposed first implementation increment (Phase 1, slice 1)

1. Scaffold: Next.js + TS + Prisma, plus Vitest with decimal.js for money tests. CI typechecks and tests.
2. Core schema: `Entity` (effective-dated `Ownership`), `AccountingPeriod`, `StdAccount` (group COA from Databook L1/L2/L3),
   `SourceAccount` + `AccountMapping`, `TbSubmission` (versioned) + `TbLine`, `ImportBatch` + `ValidationIssue`,
   `User` / `Role` / `UserScope` / `Session`, `AuditLog`.
3. Seed the six entities, periods Dec-2024…Dec-2026, and the group COA.
4. Databook importer: entity tabs → submissions for one period, with the cumulative-balance and BB2 reset rules (handoff §3).
5. Statement engine: BS/PL by L1 per entity and consolidated with ELIM.
   **Acceptance test: Sep-2026 totals equal the Databook BS/PL tabs to the cent.**
6. Minimal UI: login, entity/period picker, BS/PL with drill-down to lines, EN/ES toggle.

Deliverables 2–5 (architecture, DB plan, UI plan, backlog) follow once the strategy in §5 is confirmed.
