# Mama Lycha Group Controller Portal — Handoff Brief

Read this together with the MASTER PROJECT PROMPT. It records decisions and verified facts from the
Fixed Assets & Leases workstream (Oct 2026) so they are not re-litigated or lost. Put it in the repo root
(or `docs/`) and reference it from `CLAUDE.md`.

Status legend: **[Verified]** seen in source data or vendor docs · **[Decision]** agreed with the Controller ·
**[Open]** needs a decision · **[Unverified]** not yet inspected.

---

## 0. Controller decisions — 2026-10-19 (supersede the [Open] items below)

| # | Topic | Decision |
|---|---|---|
| D1 | FA / intangibles / leases hosting (§4) | **Option 2: the portal hosts all three subledgers.** Sage Fixed Assets is not purchased. Sage 100 stays the MLF GL of record and receives JEs from the portal. |
| D2 | MLF FA opening basis (§5) | **Replicate the Databook.** The register's 12/31/2025 opening cost, accumulated depreciation and NBV must tie to the audited Databook/GL. The Excel schedule is not loaded as opening balances. Acceptance test: register = Databook by GL account. |
| D3 | Ownership (§2) | **Every subsidiary is 100% owned** (MLF, MLL, GSA, LSA under MLB). No non-controlling interest. |
| D4 | Functional currency (§2) | **LSA is the only non-USD entity; its functional currency is NIO.** GSA is USD. |
| — | Still open | LSA translation method and rate source. Also: does the portal translate NIO itself, or take the Databook's LSA figures (which appear to be already in USD)? Phase 1 reproduces the Databook as-is, so this is not a blocker. |

## 1. Repository

- [Verified] New, empty repo: https://github.com/MLjdperez/Controller-Portal (created 2026-10-19). There is no existing
  schema, migrations, seed data, auth or Railway config, so Phase 0 is a greenfield design.

## 2. Group structure — what the Databook shows

Source: `MLF Group Trial Balances 2026 (Databook Post Audit).xlsx` (OneDrive, modified 2026-10-14).

| Portal code | Databook tab | Databook "Entity" value | Account format example | Notes |
|---|---|---|---|---|
| MLB | MLB | ML Buyer | `CROWE08`, some blank | Parent; Investment in Subs 86,383,469 |
| MLF | MLF | Mama Lycha | `15000-001-00` (Sage 100) | Sage 100 company code is **MAM** [Verified] |
| MLL | MLL | Logistics | `10100-000-20` (QuickBooks) | |
| GSA | GSA | Gotera | `110302` | Spanish source names + English translation column |
| LSA | LSA | Lunic | `110101002` | Balances carry fractional cents → likely already translated to USD [Open: confirm currency + rate source] |
| ELIM | Elim | Elim | MLF account numbers | Elimination lines keyed by reference letter (`a`, `d`, `e`, …) |

- [Verified] The Databook's BS/PL use the column label **EJE** for eliminations; the portal uses **ELIM**. Map one to the other; do not create both.
- [Open] Ownership percentages (the prompt says do not assume 100%).
- [Open] Functional currency of GSA and LSA, translation method, and rate source.

## 3. The Databook is a ready-made canonical model — reuse it for Phase 1

Every entity tab shares the same columns [Verified]:

`Cuenta · Nombre · TB Account Name English · Entity · PL/BS · BS Type · Account Type · IC · L1 · L2 · L3 · Crowe · Dec '24 · BB · Jan…Dec (2025) · BB2 · Jan-26…Dec-26`

- **L1/L2/L3** are the existing group reporting classifications. Seed the standardized chart of accounts and the source-to-standard mappings from them.
- **IC** flags intercompany accounts. Seed intercompany counterparty mapping from it.
- **Crowe** = audited 12/31/2024 balances (Crowe is the external auditor).
- Monthly columns are **cumulative balances**, not activity. BS accounts carry forward; PL accounts are YTD and reset at **BB2** (2026 opening).
- The BS/PL summary tabs build statements with `SUMIF(entity!I:I, line, entity!<month>)`, i.e. on **L1**. That is the current statement mapping and the first regression test for the portal: portal statements must reproduce the Databook BS/PL totals.

## 4. Decisions already made — fixed assets, intangibles, leases

From the architecture decision document (Claude Doc "Fixed Assets, Intangibles & Lease Accounting — Architecture Decision"):

- [Decision] Sage 100 stays the MLF general ledger of record.
- [Decision] Recommended subledger for MLF fixed assets: **Sage Fixed Assets – Depreciation** (native Sage 100 link). Status: Sage 100 2025 (v7.40), F/L link module activated for company MAM; Sage Fixed Assets **not installed**; license being confirmed with the reseller.
- [Decision] Leases need a dedicated ASC 842 calculation engine (Sage Fixed Assets has no lease module).
- [Decision] Datarails = reporting / close visibility, read-only. It never edits a balance.
- [Decision] Journal entries: Proposed → Approved → Exported → **Posted only on Sage 100 register-number confirmation**. Rejected entries kept with reason. JE ID format `<Source>-<Entity>-<YYYY>-<MM>-<seq>`, corrections `-C02`.
- **[Open — must resolve in Phase 0]** The master prompt puts the FA / intangible / lease subledgers *inside the portal*. That conflicts with the Sage Fixed Assets recommendation for MLF fixed assets. Options:
  1. Portal hosts intangibles and leases; MLF fixed assets stay in Sage Fixed Assets, and the portal imports the register and depreciation for reporting and reconciliation.
  2. Portal hosts all three; Sage Fixed Assets is not purchased.
  Choose one before building the FA schema. GSA/LSA fixed assets ($868K / $1,213K NBV) are outside the MLF schedule either way.

## 5. MLF fixed asset data — verified findings (do not load the Excel schedule as opening balances)

Working file: `MLF_FixedAssets_Datarails_DataLayer_Loaded_2026-09_v2.xlsx` (202 assets, 3,131 activity rows, flat tables).

GL mapping is by **class + location** [Verified against the TB]:

| Class | Houston | Dallas |
|---|---|---|
| Mach & Equip | 15000-001-00 | 15000-002-00 |
| Furniture | 15100-001-00 | 15100-002-00 |
| Improvements | 15150-001-00 | 15150-002-00 |
| Vehicles | 15200-001-00 | none (mapped to Houston) [Open] |
| Accum dep (all) | 16000-000-00 | 16000-000-00 |
| Depreciation expense | 60500-000-00 | 60500-000-00 |

Software and Other have no GL account. Goodwill 18700, Tradename 18750, and amortization accounts 18800/18810/18820 and 60510/60511/60512 belong to the intangibles phase.

Reconciliation result, Excel schedule vs audited Sage 100 TB [Verified]:

- 2026 activity ties. Jan–Sep depreciation is 605,067.37 GL vs 603,376.66 schedule; the difference of 1,690.71 is in Mar/Apr. The Feb and Jun additions tie. The GL also has LHI Houston +12,800 (Sep) and −275 (May) that the schedule does not.
- **Opening basis does not tie at 12/31/2025:**

  | | Schedule | GL |
  |---|---|---|
  | Cost | 8.64M | 5.85M |
  | Accum dep | (3.66)M | (1.74)M |

  NBV gap: **$865,684**. The GL accum dep was only (199,600) at 12/31/2024, which points to an acquisition (new) basis. Dec 2025 also has ~$722K of extra year-end (audit) depreciation that the schedule lacks.
- [Open] Rebase the register to the audited GL (preferred: get Crowe's FA rollforward / purchase price allocation by asset) **or** carry a documented basis-adjustment line. The FA module's opening load and acceptance test depend on this decision.

## 6. Constraints to carry into the build

- Sage 100 has no verified JE approval workflow. Approval evidence must live in the portal.
- Sage 100 imports go through Visual Integrator (license not yet confirmed).
- Sage Fixed Assets posts one company per run.
- Use decimal arithmetic for money (Prisma `Decimal`, never JS float).
- Store status values as stable codes; translate the labels only (EN/ES).
- First acceptance test for Phase 1: import the Databook entity tabs for Sep-2026, map them via L1/L2/L3, and reproduce the Databook BS (YE) and PL totals per entity and consolidated, with eliminations from the Elim tab.
