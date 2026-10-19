# Phase 0 — Deliverables 2–5

Short by design (master prompt §XVII: the assessment guides the build; it doesn't replace it). Decisions: handoff §0.

---

## Deliverable 2 — Target architecture

### Entity hierarchy

```
MLB  ML Buyer (parent, portal-native ledger, USD)
 └─ MLF  Mama Lycha Foods (Sage 100 company MAM, USD)          100%
     ├─ MLL  Mama Lycha Logistics (QuickBooks, USD)             100%
     ├─ GSA  Gotera SA de CV, El Salvador (Excel TB, USD)        100%
     └─ LSA  Lunic SA, Nicaragua (Excel TB, NIO functional)      100%
ELIM  Elimination Company (consolidation-only, portal-native)
```

Ownership is a separate, effective-dated, approved record (`Ownership`), not a column on the entity.

### Systems of record

| System | Owns | Portal's relationship |
|---|---|---|
| Sage 100 (MAM) | MLF GL | Import the TB (and later account activity). Export JEs via Visual Integrator files. Posted only on register-number confirmation. |
| QuickBooks | MLL GL | Import the TB as Excel/CSV (an API connection is Phase 6). |
| GSA / LSA Excel | Their TBs | Upload → validate → preview → approve. |
| Portal ledger | MLB and ELIM JEs; the FA / intangible / lease subledgers (D1) | Authoritative. |
| Datarails | Reporting only | Read-only consumer. Never a balance source, so nothing is double-counted. |
| PostgreSQL (Railway) | Portal data and audit history | One DB per environment (dev, prod). |
| Object storage | Original uploaded files and evidence | Railway volume in Phase 1; S3-compatible bucket when the audit module arrives. Files are addressed by SHA-256. |
| GitHub / Railway | Code / hosting | `main` deploys to prod; `prisma migrate deploy` runs on start (same as the budget app). |

### Financial data flow

```
source file ─► ImportBatch (sha256, original kept) ─► ValidationIssue[] ─► preview
           ─► TbSubmission vN (entity, period, DRAFT→VALIDATED→APPROVED; vN-1 → SUPERSEDED)
           ─► TbLine (source account, debit, credit, signed balance, currency)
           ─► AccountMapping (source account → StdAccount, effective-dated, approved)
           ─► StdAccount → StatementLine (L1/L2/L3 from the Databook)
           ─► Statement engine: per entity → + ELIM → consolidated
```

- **Sign convention:** signed balance = debit − credit (debits positive). Statements flip credit-normal lines for display only.
- **Balances, not activity:** a TB line is the cumulative balance at period end (as in the Databook). Monthly activity = this period − prior period. PL resets at fiscal-year start.
- **Unmapped accounts** block an APPROVED status. They are never silently dropped into a statement.
- **Translation (Phase 2):** for LSA, balance sheet at the closing rate, P&L at the average rate, equity at historical rates, and the plug to CTA. Every translated line keeps its original amount, rate, rate type and rate date. Phase 1 takes the Databook's LSA USD figures as-is, labelled `translationSource = DATABOOK`.

### Journal entry architecture (Phase 2, designed now so Phase 1 doesn't block it)

One `JournalEntry` / `JournalLine` engine for all sources (MANUAL, MLB, ELIM, FA, INTANGIBLE, LEASE, ACCRUAL, CONSOL).
Status codes: `PROPOSED → APPROVED → EXPORTED → POSTED`, plus `REJECTED` (kept, with a reason) and `REVERSED`.
`destination`: `PORTAL` (MLB, ELIM: posting = approval plus period open) or `SAGE100` / `QUICKBOOKS` (POSTED only with an external reference).
ID `<Source>-<Entity>-<YYYY>-<MM>-<seq>`, corrections `-C02`. Preparer ≠ approver is enforced on the server.

### Consolidation and elimination flow

Entity TBs (approved) → standardized → translated → sum of legal entities → + ELIM JEs (approved) → consolidated.
Intercompany: `SourceAccount.icCounterpartyId` (seeded from the Databook `IC` flag) → pairwise match per period with a tolerance → difference classified as timing / FX / unexplained → only matched or approved-rule balances produce a proposed ELIM JE. The Databook's reference letters (`a`, `d`, `e`, …) become `EliminationRule` codes.

### Documents and permissions

- Roles: `CONTROLLER`, `CFO` (admins), `COLLABORATOR`, `AUDITOR` (read-only plus PBC uploads).
- Permissions are stable codes checked on the server in every server action. The UI hides what it can't do, but that's not the control.
- Scope = an explicit entity grant (`UserScope`). Empty means nothing. A grant on a parent cascades only if `includeDescendants`.
- Auditors are additionally limited to granted periods and audit years (Phase 5).
- `AuditLog` is append-only, enforced by a Postgres trigger that rejects UPDATE and DELETE.

---

## Deliverable 3 — Database and integration plan

The budget DB is not reused (D5). The concepts that are carried over are marked ⇐.

| Area | Tables | Phase |
|---|---|---|
| Identity | `User` ⇐, `Role` ⇐, `RolePermission` ⇐, `UserRole` ⇐, `UserScope` ⇐, `Session` ⇐ | 1 |
| Audit | `AuditLog` ⇐ (+ append-only trigger) | 1 |
| Group | `Entity` ⇐ (+ kind, sourceSystem, functionalCurrency), `Ownership` (new, effective-dated) | 1 |
| Calendar | `AccountingPeriod` (fiscalYear, month), `EntityPeriod` (status OPEN / LOCKED per entity) | 1 |
| COA | `StatementLine` (L1/L2/L3 tree, BS/PL, sort, EN/ES), `StdAccount`, `SourceAccount` ⇐ (was `GlAccount`), `AccountMapping` (versioned) | 1 |
| Ingestion | `ImportBatch` ⇐ (`UploadBatch`), `ValidationIssue` ⇐, `StoredFile` | 1 |
| TB | `TbSubmission` (versioned, supersedes), `TbLine` | 1 |
| FX | `ExchangeRate` ⇐ (+ rateDate, source, approval), `Translation` fields on `TbLine` | 1 (table) / 2 (engine) |
| JE | `JournalEntry`, `JournalLine`, `JournalApproval`, `JeExport` | 2 |
| Intercompany | `IcMatch`, `IcDifference`, `EliminationRule` | 2 |
| Close | `CloseTemplate`, `CloseTask`, `Thread`, `Message`, `Notification` ⇐ | 3 |
| Subledgers | `FixedAsset`, `AssetBook`, `DepreciationRun`, `Intangible`, `Lease`, `LeaseSchedule`, `Accrual`, `AccrualApplication` | 4 |
| Audit/Tax | `Document`, `DocumentVersion`, `DocumentLink`, `PbcRequest`, `TaxFiling`, `TaxSchedule` | 5 |

Key constraints: `TbSubmission @@unique([entityId, periodId, version])`; at most one APPROVED per entity and period (partial unique index); `ImportBatch.sha256` + entity + period is unique, so re-uploading the same file is detected and not loaded twice; money is `Decimal(20,6)` (LSA carries sub-cent values); `AccountMapping` is never updated in place — a new row with `effectiveFrom` plus approval.

Migrations: Prisma Migrate. SQL is generated from the schema and reviewed before commit. `migrate deploy` runs on Railway start. Nothing is destructive without a backup and a documented plan.

Imports, Phase 1: the **Databook importer** (one-time and regression baseline: entity tabs → COA, mappings, submissions for every month column) and the **generic TB upload** (CSV/XLSX: account, name, debit, credit or balance). Sage 100 / QuickBooks exports use the generic upload with per-source column profiles.

---

## Deliverable 4 — UI and workflow plan

Navigation follows master prompt §23. Phase 1 builds: **Dashboard, Financial Statements, Entities & Trial Balances, Administration**.
The other sections appear in the nav as disabled ("Phase n") so the map is visible from day one.

| Screen | Phase 1 content |
|---|---|
| Dashboard | Period picker. TB status grid (entity × status: missing / draft / validated / approved). Headline KPIs (revenue, GP%, net income, cash, total assets) with each value labelled **final / preliminary / missing**, never a silent 0. |
| Financial Statements | BS / PL. Entity or consolidated. Columns: entity contributions, ELIM, consolidated; current month, prior month, YTD. Click a line → std accounts → source accounts → TB line → import batch → original file. |
| Trial Balances | Upload → validation report → preview → submit → approve. Version history per entity and period. Unmapped-account queue. |
| Administration | Users, roles, entity scopes; entities and ownership; COA and mapping maintenance (with approval); audit log viewer. |

Workflow (Phase 1): Collaborator uploads the GSA TB → the system validates (balanced, known accounts, period, currency, duplicate) → collaborator previews and submits → Controller approves → statements switch from preliminary to final for GSA.

EN/ES toggle in the header, persisted on `User.locale`. Labels come from message catalogs keyed by stable codes.

---

## Deliverable 5 — Prioritized backlog (Phase 1)

Each item is one or more commits, each testable on its own. ✱ marks an essential item (blocks the acceptance test).

| # | Item | Depends | Test |
|---|---|---|---|
| 1 ✱ | Scaffold: Next.js 15, TS strict, Prisma 6, Vitest, decimal.js, security headers, `.gitignore` blocks data files | — | `typecheck`, `test` green |
| 2 ✱ | Core schema (identity, audit, group, calendar, COA, ingestion, TB, FX) plus first migration with the append-only trigger | 1 | `prisma validate`; migration SQL reviewed |
| 3 ✱ | Seed: roles/permissions, six entities, ownership chain, periods Dec-2024…Dec-2026, Controller user | 2 | seed is idempotent (run twice → same counts) |
| 4 ✱ | Auth + scopes + audit log (ported) | 2 | unit: scope cascade, lockout; preparer ≠ approver helper |
| 5 ✱ | Money and balance library: signed balance, activity from cumulative, BB2 reset | 1 | unit tests with known cents |
| 6 ✱ | Databook importer → StatementLine / StdAccount / SourceAccount / mappings / submissions | 3, 5 | row counts per tab; every account mapped |
| 7 ✱ | Statement engine (L1, per entity, + ELIM, consolidated) | 6 | **Acceptance: Sep-2026 BS and PL equal the Databook to the cent** |
| 8 | Statements UI with drill-down | 7, 4 | manual + server auth check |
| 9 | Generic TB upload (validate, preview, version, duplicate) | 3, 5 | re-upload same file → rejected as duplicate |
| 10 | Dashboard (status grid, KPIs with final / preliminary / missing) | 7, 9 | missing entity → KPI shows "missing", not 0 |
| 11 | Admin: users, scopes, mapping maintenance with approval | 4 | collaborator cannot approve own mapping |
| 12 | Railway: new service + Postgres + volume, `DEPLOY.md` | 1–3 | health check green on staging |

Later enhancements (not Phase 1): QuickBooks API, Sage activity import, cash flow, NIO translation engine, JE engine (Phase 2 start).

**Status 2026-10-19:** items 1–7 are done. The migration and seed run on local Postgres 16 (Docker). The seed is idempotent, and the DB
controls were probed: the audit log rejects UPDATE and DELETE, and the ownership range is enforced. The Databook import is idempotent (a re-import is a DUPLICATE batch).
**Acceptance passed:** statements read from the database tie to the cent on 1,728 Databook figures. Details and findings
for the Controller: `docs/private/DATABOOK_FINDINGS.md` (local only: contains financial figures). Items 8–12 are not started.

Databook findings (read-only inspection of the 2026-10-14 "Post Audit" copy):
- The entity tabs share one column layout. The Elim tab has an extra `Ref` column (col H), and its `IC` column holds the counterparty entity name.
- Header spelling varies (`Dec '24` vs `Dec24`), so the importer matches headers by normalized name, not position.
- The 2026 MLF columns are SUMIFs into an external workbook. The importer reads Excel's cached results, and a cell with no
  cached value is reported as an error rather than read as 0.
- The BS/PL tabs show one entity at a time (selector in B5 = "Mama Lycha"). Their cached values are the regression baseline for MLF.
  The other entities are checked by recomputing the SUMIF from the entity tabs.
- The Databook's own BS check row shows **0.96** out of balance for Sep-2026. The acceptance test must reproduce that 0.96,
  not hide it, and it needs a Controller explanation before it is accepted as an exception.
- Two "Post Audit" copies exist (Documents, 2026-10-14; Claude/Projects, 2026-10-16). Which one is authoritative is to be confirmed.
