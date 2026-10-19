# MASTER PROJECT PROMPT — Mama Lycha Group Controller Dashboard
## Multi-Entity Financial Close, Consolidation, Accounting, and Audit Management Portal

> Saved verbatim from the Controller on 2026-10-19. Where this conflicts with the Controller decisions in
> `CONTROLLER_PORTAL_HANDOFF.md` §0, the decisions win.

### 1. Your Role

Act as a senior software architect, Controller/CFO advisor, financial consolidation specialist, US GAAP accounting expert, and full-stack developer.

You are continuing work on an existing project. The objective is to evolve the current application into a comprehensive **Mama Lycha Group Controller Dashboard**.

This is not a request to start over or build a collection of disconnected dashboards. It is an expansion of the existing application into an integrated financial management and accounting control platform.

You are responsible for:
- Reviewing the existing application and repository.
- Preserving working functionality and established architecture.
- Evaluating the current database schema and existing modules.
- Identifying what can be reused, extended, or refactored.
- Designing a common financial data model across all group companies.
- Implementing the portal incrementally, with working functionality at each stage.
- Ensuring accounting calculations, journal entries, consolidation, permissions, and audit trails are reliable.
- Maintaining a professional interface suitable for Controllers, CFOs, accounting personnel, and external auditors.

Think like a Controller designing a scalable financial control environment, not merely a developer creating CRUD screens.

## 2. Existing Project — Important Instructions

The application has already made progress. The existing technical foundation includes Next.js/TypeScript, PostgreSQL with Prisma, Railway hosting, GitHub source control, a multi-entity and bilingual design, an established database schema, seed data, approval concepts, and audit-trail functionality.

Treat these details as context to verify against the actual repository, not as permission to assume everything is complete.

**Before changing the application:**

1. Inspect the existing GitHub repository and current codebase.
2. Review the README, package configuration, database schema, Prisma models, migrations, seed files, authentication, and existing functionality.
3. Identify the current deployment configuration and environment dependencies.
4. Review the existing fixed asset, intangible asset, and lease accounting work.
5. Identify which existing features are functional, partially implemented, or only planned.
6. Produce a concise assessment of the current architecture and proposed changes.
7. Preserve working components, database history, existing data, and user-facing functionality.

Do not recreate the application from scratch, replace the database without justification, or discard existing work.

Do not run destructive migrations, delete existing records, overwrite production configuration, or change authentication without a documented migration plan and appropriate safeguards.

If access to GitHub, Railway, or another external system is unavailable, clearly identify what you inspected and what remains unverified. Continue with the accessible codebase and produce an actionable implementation plan.

## 3. Business Objective

Create a centralized portal that allows the Controller and CFO to manage the financial close, financial reporting, accounting entries, consolidation, audit support, tax documentation, and accounting subledgers for the entire Mama Lycha Group.

The portal must integrate financial data from different accounting systems and reporting formats, standardize the data, and present it through a unified financial model.

It must support:

- Monthly and year-to-date financial reporting.
- Consolidated and entity-level financial statements.
- Intercompany reconciliation and elimination.
- Journal entry preparation, approval, and tracking.
- Month-end close checklists and task assignments.
- Fixed assets, intangible assets, and lease accounting.
- Accounting accruals and expense utilization.
- Tax return and tax schedule management.
- External audit preparation and PBC request tracking.
- Secure document storage and financial evidence.
- Internal messaging, questions, and information requests.
- Bilingual English and Spanish functionality.
- Role-based access and a complete audit trail.

The ultimate goal is to reduce manual work, improve financial reporting accuracy, strengthen internal controls, and make every financial balance traceable to its underlying transactions, journal entries, and supporting documents.

---

# PART I — GROUP STRUCTURE AND FINANCIAL ARCHITECTURE

## 4. Legal Entities and Ownership Structure

Configure the following six entities as the initial group structure.

| Code | Entity | Ownership | Accounting source |
|---|---|---|---|
| MLB | ML Buyer | Parent company | Native journal entries maintained in the portal |
| MLF | Mama Lycha Foods | Owned by MLB | Sage 100; financial data also integrated with Datarails |
| MLL | Mama Lycha Logistics | Owned by MLF | QuickBooks |
| GSA | Gotera SA de CV | Owned by MLF | Monthly Excel trial balance |
| LSA | Lunic SA | Owned by MLF | Monthly Excel trial balance |
| ELIM | Elimination Company | Consolidation-only entity | Traceable intercompany elimination journal entries |

Ownership and consolidation percentages must be configurable, effective-dated, and explicitly approved. Do not assume that every ownership percentage is 100% unless verified.

Build the group structure so that additional entities can be added later without redesigning the application.

### MLB — Parent company

MLB is the parent company. It has no routine operating transactions in the current scope, but it requires a native journal entry capability within the portal.

Support:
- Manual journal entries.
- Supporting documentation.
- Debit and credit validation.
- Journal entry review and approval.
- Posting references and period tracking.
- Entity-level financial statements.
- Consolidation reporting.

MLB must not depend on a separate accounting system for its portal-managed entries.

### MLF — Mama Lycha Foods

MLF uses Sage 100 as its accounting system and also integrates financial reporting with Datarails.

The portal should import or receive financial data from the authoritative Sage 100 accounting records, while using Datarails for supplemental reporting or analysis when useful.

Do not count the same financial activity twice because it appears in both Sage 100 and Datarails.

Define a clear data-source hierarchy and reconciliation process. Sage 100 remains the authoritative general ledger for MLF.

Support:
- Trial balance imports.
- Journal entry and account activity imports where available.
- Chart of accounts mapping.
- Monthly financial reporting.
- Subledger and GL reconciliations.
- Controlled journal entry exports.
- Period-to-period comparisons.

### MLL — Mama Lycha Logistics

MLL uses QuickBooks.

Support a configurable QuickBooks integration if the appropriate connection and permissions are available. Otherwise, support controlled Excel or CSV imports.

Maintain the source account number, source account name, accounting period, source transaction references when available, and import history.

QuickBooks remains the authoritative accounting system for MLL.

### GSA and LSA — Foreign subsidiaries

GSA and LSA submit monthly Excel trial balances.

Build a standardized upload workflow that:
- Accepts the approved file format.
- Identifies the reporting entity and accounting period.
- Validates account numbers, account descriptions, dates, currencies, and debit/credit balances.
- Maps source accounts to the group's standardized chart of accounts.
- Identifies unmapped accounts and missing data.
- Detects duplicate submissions.
- Displays a preview before accepting the upload.
- Preserves the original uploaded file.
- Records the uploader, submission timestamp, validation results, and approval status.

Support local currency and group reporting currency, including documented exchange-rate sources and translation methodology where applicable.

Do not silently treat a foreign subsidiary's trial balance as USD. Require the reporting currency and the applicable translation policy.

### ELIM — Intercompany elimination entity

ELIM is a consolidation-only entity used to eliminate intercompany transactions and balances.

ELIM must support:
- Intercompany balance eliminations.
- Intercompany revenue and expense eliminations.
- Intercompany loan and interest eliminations.
- Intercompany profit in inventory eliminations, when applicable.
- Other approved consolidation adjustments.
- Reversals and adjustments.
- Traceable journal entry generation.
- Reconciliation between counterparties.
- Consolidated financial reporting.

Every elimination must have a unique ID, accounting period, source entities, affected accounts, amounts, calculation basis, supporting evidence, and journal entry reference.

ELIM is not a substitute for correcting errors in the underlying legal entities. The system must distinguish genuine consolidation eliminations from source accounting errors that require correction in the originating entity.

## 5. System-of-Record Architecture

The portal will be hosted through Railway, with source code managed in GitHub.

Maintain the following system ownership model.

| System | Primary responsibility |
|---|---|
| Sage 100 | Authoritative MLF general ledger |
| QuickBooks | Authoritative MLL general ledger |
| Subsidiary Excel reports | Source trial balances for GSA and LSA |
| Portal-native ledger | MLB journal entries and ELIM consolidation adjustments |
| PostgreSQL | Application data, standardized financial records, workflows, metadata, and audit history |
| Datarails | Supplemental financial reporting and analysis for MLF and the group, as supported by the existing integration |
| Controller Portal | Unified reporting, consolidation, close management, journal entry workflow, subledgers, documents, and collaboration |

The portal should not silently change or replace source-system balances.

Journal entries created in the portal must have an explicit posting destination and status. Where an entry affects an externally maintained ledger, the workflow must distinguish between proposed, approved, exported, and confirmed posted.

The application must not represent an entry as posted merely because it has been approved or exported.

---

# PART II — FINANCIAL DATA MODEL AND FINANCIAL STATEMENTS

## 6. Standardized Trial Balance Data Model

Create a canonical financial data model that allows all entities to report through a common chart of accounts while preserving their original source information.

Every imported or generated financial record should include, where applicable:

- Legal entity.
- Accounting period.
- Source system.
- Source account number.
- Source account description.
- Standardized account ID.
- Standardized account number.
- Account classification.
- Debit balance.
- Credit balance.
- Signed balance under a documented convention.
- Source currency.
- Reporting currency.
- Exchange rate and rate date.
- Source file or transaction reference.
- Import batch ID.
- Import timestamp.
- Data validation status.
- Approval status.
- Record creation and modification history.

Design separate structures for:
- Chart of accounts.
- Source-to-standard account mappings.
- Trial balance submissions.
- Trial balance lines.
- Journal entry headers and lines.
- Accounting periods.
- Exchange rates.
- Consolidation adjustments.
- Intercompany counterparties.
- Financial statement mappings.
- Import batches and validation errors.

Use immutable or versioned records where appropriate so a corrected submission does not destroy the history of the original submission.

## 7. Standardized Chart of Accounts

Create a group chart of accounts mapping framework.

Each source entity may retain its own account numbering and descriptions, but its accounts must map to a standardized financial reporting classification.

Support mappings for:
- Cash and cash equivalents.
- Accounts receivable.
- Inventory.
- Prepaid expenses.
- Other current assets.
- Fixed assets.
- Accumulated depreciation.
- Intangible assets.
- Accumulated amortization.
- Right-of-use assets.
- Accounts payable.
- Accrued liabilities.
- Lease liabilities.
- Debt and other liabilities.
- Equity.
- Revenue.
- Cost of goods sold.
- Operating expenses.
- Depreciation and amortization.
- Interest expense.
- Income tax expense.
- Other income and expenses.
- Intercompany balances and activity.

Allow the Controller to configure account groupings, financial statement line mappings, and presentation order.

Prevent unmapped or conflicting accounts from being silently included in financial statements.

## 8. Financial Statements

Build a financial reporting module that generates entity-level and consolidated financial statements from the standardized financial data.

### Profit and Loss Statement

Provide:
- Current month.
- Prior month.
- Month-over-month variance.
- Year-to-date actuals.
- Prior-year comparison.
- Full-year actual and forecast, if data is available.
- Budget comparison, when budget data becomes available.
- Percentage of revenue.
- Drill-down to account balances and supporting journal entries.

Include configurable revenue, cost of sales, gross profit, operating expenses, EBITDA, depreciation and amortization, operating income, interest, taxes, and net income.

Do not assume a single EBITDA definition. Make the presentation configurable and document any adjustments used.

### Balance Sheet

Provide:
- Current period ending balances.
- Prior month balances.
- Prior-year balances.
- Month-over-month movements.
- Current and noncurrent classifications.
- Entity-level and consolidated views.
- Drill-down to account activity, journal entries, and supporting documents.

Validate that total assets equal total liabilities plus equity, using the documented accounting sign convention and allowing only approved, explained exceptions.

### Cash Flow Statement

Build a configurable statement of cash flows using the indirect method as the initial target, subject to the applicable accounting framework.

Use:
- Beginning and ending cash balances.
- Net income.
- Noncash expenses.
- Changes in working capital.
- Capital expenditures and other investing activity.
- Borrowings, repayments, equity movements, and other financing activity.
- Relevant supplemental accounting data.

A trial balance alone does not reliably identify all cash flow classifications or movements. Therefore, design the cash flow module to use period-over-period balance movements, available transaction-level data, cash flow mappings, and supporting schedules.

Where the available information is insufficient to calculate a reliable cash flow statement, flag the missing inputs instead of inventing cash flows or forcing a reconciliation.

### Consolidated reporting

Provide:
- Consolidated P&L.
- Consolidated Balance Sheet.
- Consolidated Cash Flow Statement.
- Entity contribution reports.
- Consolidation adjustments.
- ELIM journal entry details.
- Pre-elimination versus post-elimination balances.
- Consolidation reconciliation and exceptions.

Support configurable fiscal calendars and accounting periods.

## 9. Multi-Currency and Consolidation Rules

Design the data model to support multiple functional and reporting currencies.

Implement configurable currency translation consistent with the applicable reporting framework, including appropriate treatment of income statement accounts, balance sheet accounts, historical-rate items, and foreign currency translation adjustments where applicable.

Do not use one universal exchange rate for all accounts.

For each translation, retain:
- Original currency balance.
- Exchange rate.
- Rate date or period.
- Rate type.
- Translated amount.
- Source and approval status.

Consolidation must preserve entity-level accounting results while recording consolidation-only adjustments separately.

Any ownership, foreign currency, or consolidation treatment requiring judgment must be documented and approved.

---

# PART III — INTERCOMPANY MANAGEMENT AND ELIMINATIONS

## 10. Intercompany Reconciliation Engine

Build an intercompany module that identifies, matches, reconciles, and eliminates intercompany balances and transactions.

Track:
- Originating entity.
- Counterparty entity.
- Accounting period.
- Transaction type.
- Invoice or transaction reference.
- Source account.
- Intercompany account.
- Transaction currency.
- Reporting currency.
- Amount and exchange rate.
- Matching status.
- Difference amount.
- Difference reason.
- Supporting evidence.
- Elimination status.
- ELIM journal entry reference.

Allow transactions to be matched using entity, counterparty, reference number, amount, currency, and period, with controlled tolerance rules.

Identify:
- Matched balances.
- Missing counterpart transactions.
- Timing differences.
- FX differences.
- Unexplained differences.
- Duplicate records.
- Transactions requiring manual review.

Do not automatically eliminate unmatched balances without an approved rule and documented support.

## 11. Traceable Elimination Journal Entries

The system must generate proposed elimination journal entries in ELIM for approved elimination scenarios.

Each entry must identify:
- Unique elimination ID.
- Accounting period.
- Source and counterparty entities.
- Source transactions or account balances.
- Debit and credit accounts.
- Debit and credit amounts.
- Currency and exchange-rate information.
- Elimination rule.
- Calculation basis.
- Supporting documentation.
- Reviewer and approval history.
- Reversal or recurrence status.
- Consolidated reporting impact.

Support recurring eliminations and period-specific adjustments without duplicating entries.

For example, if MLF records an intercompany receivable from MLL and MLL records the corresponding payable, the system should identify the matched balances and propose the appropriate elimination.

The system must not eliminate third-party transactions or intercompany balances that do not correspond to the same underlying economic relationship.

For inventory profit eliminations, design a dedicated calculation schedule that records the intercompany inventory source, seller, buyer, original profit, remaining inventory percentage or quantity, and the resulting elimination calculation. Require supporting data and accounting review.

Every elimination must be reversible, auditable, and traceable from consolidated statements to the ELIM journal entry and underlying records.

---

# PART IV — JOURNAL ENTRY MANAGEMENT

## 12. Central Journal Entry Engine

Create a common journal entry workflow for all modules.

Journal entries may originate from:
- Manual entries.
- MLB native accounting.
- ELIM consolidation eliminations.
- Fixed asset depreciation.
- Intangible asset amortization.
- Lease accounting.
- Accounting accruals.
- Approved consolidation adjustments.
- Other future accounting modules.

Each journal entry should include:
- Journal entry ID.
- Entity.
- Accounting period.
- Journal entry type.
- Source module.
- Description and business purpose.
- Debit and credit lines.
- Currency.
- Supporting documentation.
- Preparer.
- Reviewer.
- Approval timestamp.
- Posting destination.
- Export reference.
- Posting status.
- Source calculation or transaction references.
- Reversal date or reversal entry, when applicable.

Implement:
- Balanced entry validation.
- Valid GL account checks.
- Period status validation.
- Duplicate detection.
- Required supporting documentation rules.
- Approval routing.
- Rejection and resubmission.
- Controlled adjustments and reversals.
- Journal entry history.
- Posting confirmation.

The Controller and CFO should be able to review all proposed entries across the group while retaining entity-specific controls.

Approved entries destined for Sage 100 or QuickBooks should use a supported integration or controlled export/import process. Do not assume direct posting is available.

---

# PART V — FIXED ASSETS, INTANGIBLES, AND LEASES

## 13. Integrate the Existing Asset and Lease Work

Do not discard the existing fixed asset, intangible asset, and lease accounting design.

Integrate those capabilities into the broader Controller Portal, reusing the common journal entry engine, GL mappings, approval workflow, reconciliation framework, and audit trail.

### Fixed assets

Maintain a detailed register with:
- Asset ID and description.
- Legal entity.
- Asset class.
- Acquisition cost.
- Acquisition date.
- In-service date.
- Useful life.
- Depreciation method.
- Residual value.
- Depreciation convention.
- Accumulated depreciation.
- Net book value.
- Asset location and department.
- Source documentation.
- Disposals and impairments.
- Assigned GL accounts.

Generate monthly depreciation schedules and proposed journal entries.

### Intangible assets

Track:
- Acquisition or eligible capitalized cost.
- Asset classification.
- Capitalization and available-for-use dates.
- Useful life.
- Amortization method.
- Accumulated amortization.
- Net carrying value.
- Impairment review status.
- Supporting documentation.

Flag accounting judgments, including capitalization eligibility and indefinite-lived asset treatment.

### Lease accounting

Implement the approved ASC 842 lease accounting module for operating and finance leases, including:
- Lease contract information.
- Initial recognition.
- Lease liability measurement.
- ROU asset measurement.
- Discount rate assumptions.
- Payment schedules.
- Interest and principal calculations.
- Operating lease expense.
- Finance lease interest and ROU amortization.
- Modifications and remeasurements.
- Current and noncurrent liabilities.
- Lease maturity analysis.
- Proposed monthly journal entries.

### Integration requirements

All three subledgers must:
1. Map to the appropriate entity and GL accounts.
2. Generate journal entries through the common journal entry engine.
3. Retain calculation schedules and supporting evidence.
4. Reconcile subledger balances to the applicable source ledger.
5. Track preparation, review, approval, and posting status.
6. Preserve prior-period calculation history.

For MLF, entries must be exportable or otherwise transferable to Sage 100 through a validated workflow. Do not treat subledger calculations as posted accounting balances until posting is confirmed.

---

# PART VI — ACCOUNTING ACCRUALS

## 14. Accrual Management Module

Build a dedicated module for creating, approving, tracking, and reconciling accounting accruals.

Examples include:
- Freight accruals.
- Professional services.
- Bonuses and commissions.
- Utilities.
- Marketing and trade spend.
- Other operating expenses.
- Inventory-related accruals.
- Other recurring and nonrecurring expenses.

Each accrual record should include:
- Accrual ID.
- Entity.
- Accounting period.
- Description.
- Expense category.
- Vendor or counterparty.
- Department or cost center.
- Expense GL account.
- Accrued liability GL account.
- Estimated amount.
- Calculation basis.
- Supporting documentation.
- Accrual start date.
- Expected invoice date.
- Expected settlement date.
- Recurrence frequency.
- Reversal policy.
- Preparer and approver.
- Remaining balance.
- Actual expenses applied.
- Variance between estimate and actual.
- Status.

### Accrual lifecycle

Support:
1. Create accrual.
2. Attach calculation and evidence.
3. Submit for approval.
4. Generate proposed journal entry.
5. Track posting status.
6. Record actual invoices or expenses against the accrual.
7. Calculate remaining balance.
8. Generate adjustments or releases.
9. Reverse accruals where appropriate.
10. Close the accrual when fully settled or otherwise resolved.

Track accrual utilization over time.

For example, if an accrual of $10,000 is established and a $7,500 invoice is subsequently recorded against it, the dashboard should show the original amount, actual utilization, remaining balance, and any required accounting adjustment.

Do not treat the same invoice as both an expense applied against an accrual and a new expense without the appropriate accounting treatment.

Provide an accrual aging report and flag stale accruals, unexplained balances, overdue invoices, and material estimate-to-actual differences.

---

# PART VII — TAX MANAGEMENT

## 15. Tax Returns and Tax Schedule Repository

Create a tax module that serves as a centralized tax document repository and tax compliance tracking tool.

It should support:
- Uploading tax returns.
- Uploading supporting schedules.
- Tax payment and refund tracking.
- Filing deadlines.
- Tax year and period tracking.
- Legal entity.
- Tax jurisdiction.
- Tax type.
- Filing status.
- Payment status.
- External tax advisor.
- Assigned internal owner.
- Reviewer and approval status.
- Supporting documents.
- Comments and questions.
- Historical version tracking.

Support applicable federal, state, local, and foreign tax documents as needed.

### Tax schedules

Create configurable schedules for:
- Income tax returns.
- Sales and use tax.
- Payroll tax.
- Property tax.
- Other applicable tax obligations.

Allow the Controller to define the required schedule fields for each tax type.

Include tax payment dates, amounts, filing dates, confirmation numbers, refunds, and supporting evidence where applicable.

Provide a tax calendar showing upcoming deadlines and outstanding tasks.

Allow tax return information to be linked to the financial statements, trial balance, journal entries, and supporting schedules where relevant.

Do not assume that uploaded returns have been reviewed or filed. Track their actual status separately.

The initial version should focus on document management, tax schedule tracking, and compliance workflow rather than attempting to replace specialized tax preparation software.

---

# PART VIII — AUDIT MANAGEMENT

## 16. Audit Repository and PBC Request Management

Build a dedicated Audit module to support external audits, financial statement audits, tax audits, and internal control reviews.

The goal is to make the portal the central place to organize historical audit reports, current-year audit requirements, supporting documents, and communications.

### Audit archive

Allow users to upload and categorize:
- Prior-year audited financial statements.
- Audit reports.
- Management letters.
- Internal control observations.
- Trial balances.
- Lead schedules.
- Reconciliations.
- Supporting schedules.
- Tax returns.
- Contracts.
- Fixed asset and lease schedules.
- Other audit evidence.

Each document should have:
- Document ID.
- Audit year.
- Entity.
- Document category.
- Description.
- Version.
- Upload date.
- Uploaded by.
- Review status.
- Confidentiality classification.
- Linked audit request or financial account, where applicable.

Preserve prior versions and maintain a traceable document history.

### Audit requests / PBC tracker

Create a structured workflow for audit requests.

Each request must include:
- Request ID.
- Audit firm or auditor.
- Audit year.
- Entity.
- Financial statement area.
- Request description.
- Required supporting documents.
- Assigned internal owner.
- Request date.
- Due date.
- Priority.
- Status.
- Submitted response.
- Reviewer.
- Auditor comments.
- Follow-up questions.
- Resolution date.

Statuses should include:
- Not started.
- In progress.
- Pending internal review.
- Submitted to auditor.
- Follow-up required.
- Accepted or completed.
- Blocked.

Provide a dashboard showing:
- Total requests.
- Open requests.
- Overdue requests.
- Requests due within seven days.
- Requests pending auditor response.
- Requests awaiting internal information.
- Completion percentage by entity and audit area.

### Audit evidence traceability

Allow an auditor to trace a financial statement balance to:
1. The relevant entity and period.
2. The mapped GL account.
3. The trial balance or account activity.
4. Supporting journal entries.
5. The relevant subledger, where applicable.
6. Reconciliation schedules.
7. Uploaded source documents.
8. Audit request responses.

Allow users to link one piece of evidence to multiple requests without unnecessarily duplicating the underlying document.

Do not allow external auditors to see confidential information from unrelated entities unless explicitly authorized.

---

# PART IX — MONTH-END CLOSE MANAGEMENT

## 17. Group Close Calendar and Checklist

Build a centralized month-end close management module.

The Controller should be able to configure a standard monthly close calendar and assign tasks by entity, accounting period, and responsible person.

Examples:
- Submit trial balance.
- Validate source reports.
- Reconcile bank accounts.
- Reconcile accounts receivable.
- Reconcile accounts payable.
- Reconcile inventory.
- Review accruals.
- Review fixed asset additions.
- Calculate depreciation and amortization.
- Review leases.
- Reconcile intercompany balances.
- Generate ELIM entries.
- Review journal entries.
- Reconcile subledgers to the GL.
- Prepare financial statements.
- Review tax-related accruals.
- Complete balance sheet reconciliations.
- Finalize consolidated reporting.
- Lock the accounting period.

Each task should have:
- Entity.
- Accounting period.
- Task description.
- Assigned owner.
- Reviewer.
- Due date.
- Status.
- Supporting document links.
- Comments.
- Blockers.
- Completion date.
- Approval history.

Provide a group-level close dashboard and an entity-level checklist.

Highlight:
- Overdue tasks.
- Tasks due soon.
- Tasks blocked by missing submissions.
- Reconciliations with differences.
- Journal entries awaiting approval.
- Entities that have not submitted their trial balance.
- Outstanding intercompany differences.
- Audit requests dependent on incomplete close tasks.

Allow recurring tasks to be generated for future periods based on approved templates.

A period should not be marked closed until required tasks and reconciliations are complete or appropriately approved as exceptions.

---

# PART X — COMMUNICATION AND COLLABORATION

## 18. Internal Messaging and Information Requests

Build a communication layer within the portal so the Controller, CFO, accounting collaborators, subsidiary accountants, and authorized auditors can communicate in context.

Users must be able to:
- Ask questions.
- Request supporting documents.
- Request corrections to a submission.
- Clarify an accounting balance.
- Assign a task or follow-up.
- Respond to a request.
- Attach documents.
- Mention another authorized user.
- Track the resolution of an issue.

Messages should be linkable to:
- A legal entity.
- An accounting period.
- A trial balance submission.
- A GL account.
- A journal entry.
- An accrual.
- A fixed asset or lease.
- An audit request.
- A tax filing.
- A month-end close task.
- A reconciliation difference.

### Communication workflow

Each discussion should have:
- Thread ID.
- Subject.
- Related record.
- Sender and recipients.
- Creation date.
- Message history.
- Attachments.
- Status.
- Assigned owner, where applicable.
- Resolution date.

Support statuses such as Open, Awaiting Response, In Progress, and Resolved.

Provide notifications for:
- New messages.
- New information requests.
- Assigned tasks.
- Approaching deadlines.
- Overdue items.
- Returned submissions.
- Rejected journal entries.
- Audit follow-ups.

The communication history must be retained for auditability.

Implement secure permissions so users can only access messages, attachments, and linked records they are authorized to see.

Do not treat an informal message as a formal approval unless the user explicitly completes the designated approval workflow.

---

# PART XI — USER MANAGEMENT AND SECURITY

## 19. Roles and Permissions

Implement role-based access control.

### Controller — Administrator

The Controller has administrative access to:
- All authorized entities.
- Financial statements.
- Trial balance submissions.
- Consolidation.
- Journal entries.
- Accounting subledgers.
- Accruals.
- Tax schedules.
- Audit management.
- Close tasks.
- User management.
- Accounting policies.
- GL mappings.
- Approvals and reconciliations.

### CFO — Administrator

The CFO has administrative visibility and appropriate approval authority across the group.

Allow the CFO to review financial reporting, approve designated journal entries and adjustments, monitor the close, review audit matters, and manage users within the permissions assigned to the CFO role.

### Accounting Collaborators

Collaborators may be assigned to one or more entities and modules.

Permissions should be configurable to allow:
- Uploading trial balances.
- Maintaining assigned records.
- Preparing journal entries.
- Completing close tasks.
- Uploading supporting documents.
- Responding to questions.
- Viewing authorized financial reports.

Do not automatically grant approval or administrative permissions to all collaborators.

### External Auditors

Auditors should have controlled, preferably read-only access to authorized entities, periods, audit requests, and evidence.

Allow them to:
- View assigned audit requests.
- Access approved financial reports and documents.
- Ask follow-up questions.
- Upload requested evidence if permitted.
- Track request status.

External auditors must not be able to modify accounting records, change accounting policies, approve journal entries, or access unrelated confidential information.

### User Administration

Controller and CFO administrators must be able to:
- Create and deactivate users.
- Assign roles.
- Assign entity-level access.
- Assign module permissions.
- Configure approval authority.
- Reset or manage access through the supported authentication process.
- Review user activity.

Implement secure authentication, server-side authorization, session protection, and audit logging.

Do not rely solely on hiding buttons in the user interface to enforce permissions. Validate authorization on the server for every protected action.

## 20. Audit Trail and Security Controls

Maintain a reliable audit trail for:
- User creation and deactivation.
- Login and relevant security events.
- Trial balance uploads.
- Data changes.
- Journal entry creation and approval.
- Posting and reversal status.
- Accounting policy changes.
- GL mapping changes.
- Intercompany eliminations.
- Reconciliations.
- Document uploads and version changes.
- Audit request submissions.
- Tax schedule updates.
- Period closing and reopening.

Use append-only audit records where practical.

Protect confidential financial and tax documents with appropriate access controls.

Store credentials, tokens, and secrets in secure environment variables or approved secret management facilities. Never expose them in source code, browser bundles, logs, or GitHub commits.

Define appropriate backup, recovery, and data retention procedures.

---

# PART XII — BILINGUAL EXPERIENCE

## 21. English and Spanish

The entire portal must support English and Spanish.

Provide a language selector in the main interface, with a user's language preference persisted across sessions.

Translate:
- Navigation.
- Page titles.
- Buttons.
- Form labels.
- Validation messages.
- Notifications.
- Workflow statuses.
- Dashboard metrics.
- Help text.
- Close tasks.
- Audit request interfaces.
- Journal entry workflow.
- Tax and accrual interfaces.
- User administration.

Store controlled status values and accounting classifications as stable internal codes rather than translated text.

Display the correct language labels in the interface while maintaining consistent data structures and reporting logic.

Allow users to enter descriptions, questions, and comments in either language.

Do not automatically translate official legal entity names, original source document titles, account numbers, or financial records in a way that alters their underlying meaning.

Preserve the original document and text while optionally supporting a translated description.

Use locale-aware date, number, and currency formatting. Financial calculations must remain consistent regardless of the user's display language.

---

# PART XIII — MAIN DASHBOARD AND NAVIGATION

## 22. Executive Controller Dashboard

The landing page should be an actionable management dashboard, not simply a collection of charts.

Provide filters for:
- Accounting period.
- Legal entity.
- Consolidated versus standalone reporting.
- Reporting currency.
- Module.
- Status.

### Financial KPIs

Include:
- Consolidated revenue.
- Gross profit and gross margin.
- EBITDA, with documented calculation methodology.
- Operating income.
- Net income.
- Cash and cash equivalents.
- Accounts receivable.
- Inventory.
- Accounts payable.
- Working capital.
- Total assets.
- Total liabilities.
- Equity.
- Capital expenditures.
- Depreciation and amortization.
- Lease liabilities.
- Outstanding accruals.

Show current month, year-to-date, and prior-period comparisons where data is available.

Do not display metrics as zero when data is missing or incomplete. Clearly distinguish zero balances from missing submissions, incomplete mappings, and unvalidated data.

### Close and Control KPIs

Include:
- Group close completion percentage.
- Trial balance submission status by entity.
- Journal entries pending approval.
- Journal entries awaiting posting confirmation.
- Unresolved reconciliation differences.
- Unmatched intercompany balances.
- Overdue close tasks.
- Outstanding audit requests.
- Upcoming tax deadlines.
- Accruals requiring review.
- Assets or leases with incomplete information.

### Dashboard behavior

Every metric should be clickable and lead to the underlying records, reports, or workflow.

Clearly display:
- Reporting period.
- Data freshness.
- Source submission status.
- Validation status.
- Consolidation status.
- Outstanding exceptions.

Do not show consolidated results as final until required entities and consolidation processes have met the applicable validation criteria. If the Controller chooses to view preliminary results, label them as preliminary and identify missing inputs.

## 23. Recommended Navigation

Organize the application into the following main areas:

1. Executive Dashboard.
2. Financial Statements.
3. Entities and Trial Balances.
4. Consolidation and Intercompany.
5. Journal Entries.
6. Month-End Close.
7. Fixed Assets.
8. Intangible Assets.
9. Lease Accounting.
10. Accrual Management.
11. Tax Management.
12. Audit and PBC Requests.
13. Messages and Information Requests.
14. Reports and Reconciliations.
15. Administration and Accounting Policies.

Use a consistent layout, responsive design, intuitive navigation, and clear workflow indicators.

Prioritize speed, clarity, and the ability to navigate from a consolidated number to its underlying evidence.

---

# PART XIV — IMPLEMENTATION AND TECHNICAL REQUIREMENTS

## 24. Technical Architecture

Preserve the existing architecture unless an evidence-based assessment identifies a compelling reason to change it.

The expected hosting and development model is:
- GitHub for source control.
- Railway for application hosting and deployment.
- Next.js and TypeScript for the application, subject to verification of the existing implementation.
- PostgreSQL with Prisma for database access, subject to verification.
- Secure file storage for uploaded documents, with an appropriate storage solution and backups.
- Supported integrations or controlled imports for Sage 100, QuickBooks, Datarails, and subsidiary Excel files.

Design modular components and services with clear boundaries.

Separate:
- User interface.
- Authentication and authorization.
- Financial data ingestion.
- Chart of accounts mapping.
- Financial statement calculations.
- Consolidation.
- Journal entry generation.
- Accounting subledgers.
- Document management.
- Messaging.
- Audit trail.
- Reporting.

Avoid duplicating financial calculation logic across multiple screens.

Use centralized services and reusable validation rules.

## 25. Data Integrity and Reliability

Implement:
- Database transactions for multi-step accounting operations.
- Unique constraints and referential integrity.
- Import batch identifiers.
- Idempotent imports and integration operations.
- Duplicate detection.
- Validation of debit and credit totals.
- Controlled period locking.
- Versioned records and audit history.
- Appropriate numeric precision for financial amounts.
- Consistent currency handling.
- Reliable date and accounting-period logic.
- Automated tests for critical accounting calculations.

Do not use floating-point arithmetic for financial calculations where exact decimal arithmetic is required.

Do not allow an import retry to duplicate financial records or journal entries.

Preserve the original source files and import metadata.

Provide clear error messages and recovery procedures for failed uploads, calculations, and integrations.

## 26. Deployment and GitHub Workflow

Before modifying the repository:
- Inspect the current branch and uncommitted changes.
- Identify the deployment branch.
- Review the existing Railway configuration.
- Confirm environment variables and database connectivity.
- Understand the existing migration strategy.

Make incremental changes.

Do not commit secrets, production database credentials, private documents, or sensitive financial records to GitHub.

Use appropriate development and production environments.

Database migrations must be version-controlled and tested before production deployment.

Do not run destructive schema changes against production without an approved migration plan and a verified backup or recovery strategy.

Provide clear deployment instructions and a record of the files changed.

## 27. Financial Data Imports

Implement a standardized import framework.

Each import should have:
- Entity.
- Accounting period.
- Source system.
- File or integration reference.
- Import batch ID.
- Uploading user.
- Timestamp.
- Row counts.
- Validation results.
- Duplicate checks.
- Error report.
- Approval status.

Support:
- CSV and Excel trial balances.
- Chart of accounts.
- Account mapping tables.
- Journal entry templates.
- Asset registers.
- Lease registers.
- Accrual schedules.
- Tax schedules.
- Audit evidence.

Where direct system integrations are available, use supported and secure mechanisms. Otherwise, provide controlled file-based workflows.

---

# PART XV — IMPLEMENTATION ROADMAP

## 28. Phase 0 — Repository Assessment and Architecture

Before adding features:
1. Inspect the repository.
2. Document the current implementation.
3. Identify existing modules and schema.
4. Map the current features to the target scope.
5. Identify data migration and integration risks.
6. Recommend the minimum changes needed to support the broader application.
7. Present the proposed architecture and implementation sequence.

Preserve existing work and identify any assumptions that require clarification.

## 29. Phase 1 — Financial Foundation

Build the common financial foundation first.

Implement:
- Legal entity hierarchy.
- User and role management.
- Accounting periods.
- Standardized chart of accounts.
- Source-to-standard account mappings.
- Trial balance import and validation.
- Import history.
- Basic financial statements.
- Entity-level reporting.
- Financial statement drill-down.
- Initial dashboard.
- Bilingual interface.

The objective is to reliably consolidate the financial data from the six entities before building advanced workflows.

## 30. Phase 2 — Consolidation and Journal Entries

Implement:
- Central journal entry engine.
- MLB native journal entries.
- ELIM journal entries.
- Intercompany matching.
- Intercompany reconciliation.
- Elimination calculations and approvals.
- Consolidated P&L and Balance Sheet.
- Multi-currency translation where applicable.
- Cash Flow Statement with required validation.
- Consolidation reporting and reconciliation.

## 31. Phase 3 — Month-End Close and Collaboration

Implement:
- Close calendar.
- Entity-level close checklists.
- Task assignment.
- Review and approval workflows.
- Internal messages and information requests.
- Notifications.
- Reconciliation issue tracking.
- Period lock and controlled reopening.

## 32. Phase 4 — Fixed Assets, Intangibles, Leases, and Accruals

Integrate the existing asset and lease accounting work.

Complete:
- Fixed asset register and depreciation.
- Intangible asset register and amortization.
- Lease register and ASC 842 accounting.
- Accrual management.
- Proposed journal entries.
- Subledger-to-GL reconciliations.
- Supporting documents and audit trails.

All modules must use the common entity model, accounting periods, GL mappings, journal entry engine, and permissions.

## 33. Phase 5 — Audit and Tax

Implement:
- Audit document repository.
- Historical audit archive.
- PBC request tracking.
- Auditor access.
- Audit evidence linking.
- Tax return repository.
- Tax schedule management.
- Filing calendar.
- Tax payment tracking.
- Relevant financial statement and journal entry links.

## 34. Phase 6 — Integrations and Automation

Implement or improve:
- Sage 100 data integration.
- QuickBooks integration.
- Datarails integration.
- Automated subsidiary submission workflows.
- Automated close reminders.
- Exception notifications.
- Reporting exports.
- Advanced reconciliation workflows.
- Performance improvements and operational monitoring.

Prioritize the integrations that provide the greatest reliability and time savings.

Do not delay the core financial foundation while attempting to automate every source system.

---

# PART XVI — ACCEPTANCE CRITERIA

## 35. Required Validation Before Production

The application must be tested using realistic, clearly identified test data.

At minimum, demonstrate that:

1. All six entities can be configured with the correct ownership and source systems.
2. Trial balances can be imported and validated for the applicable entities.
3. Source accounts map to standardized financial statement classifications.
4. Duplicate uploads are detected and do not duplicate balances.
5. Financial statements can be generated at the entity level.
6. Consolidated statements reflect approved elimination entries.
7. Unmapped accounts and missing submissions are clearly identified.
8. Consolidated debits and credits reconcile under the documented accounting convention.
9. MLB can generate, approve, and track native journal entries.
10. ELIM can generate traceable elimination journal entries.
11. Intercompany differences can be identified and resolved through a controlled workflow.
12. Cash flow calculations identify missing data rather than inventing values.
13. Fixed asset and lease modules generate validated accounting schedules and proposed entries.
14. Accruals track initial estimates, utilization, remaining balances, and adjustments.
15. Tax returns and audit documents can be uploaded, categorized, and retrieved by authorized users.
16. Audit requests can be assigned, answered, reviewed, and closed.
17. Close tasks can be assigned and tracked by entity and period.
18. Users can communicate in context and maintain a traceable discussion history.
19. Role-based permissions are enforced on the server.
20. English and Spanish are supported throughout the implemented interface.
21. Prior-period financial records and audit history remain available.
22. The application can be deployed to Railway using the established GitHub workflow.
23. Errors, failed imports, and incomplete data are clearly surfaced.
24. Sensitive documents and financial records are not exposed to unauthorized users.

Do not declare a module complete solely because its screens render. Validate its underlying business logic, persistence, authorization, error handling, and accounting results.

---

# PART XVII — HOW TO PROCEED NOW

Your immediate assignment is to expand the existing application intelligently, not to implement every module simultaneously.

Start with the following deliverables:

**Deliverable 1 — Current State Assessment**

Summarize:
- What already exists.
- What works.
- What is incomplete.
- What should be preserved.
- What must be modified.
- What risks exist in the current architecture.

**Deliverable 2 — Target Architecture**

Show:
- Entity hierarchy.
- Data sources.
- Standardized financial data model.
- Journal entry architecture.
- Consolidation and elimination flow.
- Document storage and permissions.
- Datarails, Sage 100, QuickBooks, GitHub, and Railway responsibilities.

**Deliverable 3 — Database and Integration Plan**

Identify:
- Existing tables to reuse.
- Tables to extend.
- New tables required.
- Key relationships.
- Import and integration workflows.
- Migration requirements.
- Audit trail requirements.

Avoid creating duplicate tables or competing versions of existing concepts.

**Deliverable 4 — UI and Workflow Plan**

Provide the proposed navigation, dashboard layout, primary screens, and end-to-end user workflows.

**Deliverable 5 — Prioritized Implementation Backlog**

Break the work into small, testable increments. Identify dependencies and distinguish essential requirements from later enhancements.

**Deliverable 6 — Begin Implementation**

After documenting the architecture and confirming the first implementation scope, start with Phase 1: the financial foundation.

Implement working functionality incrementally, run the relevant tests, preserve existing behavior, and report what has actually been completed versus what remains planned.

Do not spend the entire effort writing another conceptual specification. The purpose of the assessment is to guide implementation.

## Final Direction

Build a Controller's operating platform that connects financial reporting, accounting workflows, consolidation, month-end close, audit evidence, tax documentation, and subledgers into one coherent system.

Prioritize accuracy, traceability, internal controls, and practical usability over unnecessary complexity.

Every material financial number should be explainable. Every journal entry should have an owner, a purpose, and an approval/posting history. Every intercompany elimination should be traceable. Every audit request should have an assigned owner and documented resolution. Every imported financial submission should have a source, a period, and a validation status.

The final product should allow the Controller and CFO to understand the financial position of the entire group, identify outstanding accounting issues, coordinate work across entities, support external auditors, and manage month-end close from a single secure, bilingual portal.

**Preserve what already works, establish the financial foundation first, and expand through tested, controlled increments.**
