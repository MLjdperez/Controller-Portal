# Mama Lycha Group Controller Portal

Read [docs/CONTROLLER_PORTAL_HANDOFF.md](docs/CONTROLLER_PORTAL_HANDOFF.md) before any design or schema work.
Its §0 records the Controller's decisions; do not re-open them.
Scope: [docs/MASTER_PROJECT_PROMPT.md](docs/MASTER_PROJECT_PROMPT.md). Current state: [docs/PHASE0_ASSESSMENT.md](docs/PHASE0_ASSESSMENT.md).
The budget app (`MLjdperez/ML-Group-Corporate-Budget`) is a separate, live project: port its patterns, never edit it from here.

## Ground rules

- Money is decimal (Prisma `Decimal`), never JS float.
- Status values are stable codes; only labels are translated (EN/ES).
- Entity codes: MLB (parent), MLF, MLL, GSA, LSA, ELIM. The Databook column `EJE` maps to `ELIM`.
- Journal entries: Proposed → Approved → Exported → Posted (only on Sage 100 register-number confirmation).
  JE ID `<Source>-<Entity>-<YYYY>-<MM>-<seq>`, corrections `-C02`. Approval evidence lives in the portal.
- Regression baseline: portal statements must reproduce the Databook BS/PL totals (L1 mapping) per entity and consolidated.
