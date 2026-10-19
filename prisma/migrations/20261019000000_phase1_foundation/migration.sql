-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'es');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('CONTROLLER', 'CFO', 'COLLABORATOR', 'AUDITOR');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('ADMIN_USERS', 'ADMIN_ENTITIES', 'ADMIN_COA', 'APPROVE_MAPPING', 'VIEW_STATEMENTS', 'VIEW_TB', 'UPLOAD_TB', 'APPROVE_TB', 'VIEW_AUDIT_LOG', 'LOCK_PERIOD');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SUBMIT', 'IMPORT', 'LOCK', 'UNLOCK', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT');

-- CreateEnum
CREATE TYPE "EntityKind" AS ENUM ('LEGAL', 'CONSOLIDATION');

-- CreateEnum
CREATE TYPE "SourceSystem" AS ENUM ('PORTAL', 'SAGE100', 'QUICKBOOKS', 'EXCEL_TB');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'LOCKED');

-- CreateEnum
CREATE TYPE "Statement" AS ENUM ('BS', 'PL');

-- CreateEnum
CREATE TYPE "LineKind" AS ENUM ('DETAIL', 'SUBTOTAL');

-- CreateEnum
CREATE TYPE "MappingStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('DATABOOK', 'TRIAL_BALANCE');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RECEIVED', 'VALIDATED', 'FAILED', 'COMMITTED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('ERROR', 'WARNING');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'VALIDATED', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "TranslationSource" AS ENUM ('NONE', 'DATABOOK', 'PORTAL');

-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('CLOSING', 'AVERAGE', 'HISTORICAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'en',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" "RoleCode" NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permission" "Permission" NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permission")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "UserScope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "includeDescendants" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "databookName" TEXT,
    "kind" "EntityKind" NOT NULL DEFAULT 'LEGAL',
    "country" TEXT NOT NULL,
    "functionalCurrency" TEXT NOT NULL DEFAULT 'USD',
    "sourceSystem" "SourceSystem" NOT NULL,
    "sageCompanyCode" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ownership" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "percent" DECIMAL(7,4) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "basis" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ownership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityPeriod" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),

    CONSTRAINT "EntityPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementLine" (
    "id" TEXT NOT NULL,
    "statement" "Statement" NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameEs" TEXT,
    "kind" "LineKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "sumOf" TEXT[],

    CONSTRAINT "StatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StdAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameEs" TEXT,
    "statementLineId" TEXT NOT NULL,
    "isIntercompany" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceAccount" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameSource" TEXT NOT NULL,
    "nameEn" TEXT,
    "statement" "Statement" NOT NULL,
    "bsType" TEXT,
    "accountType" TEXT,
    "groupLabel" TEXT,
    "icCounterpartyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMapping" (
    "id" TEXT NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "stdAccountId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "status" "MappingStatus" NOT NULL DEFAULT 'PROPOSED',
    "reason" TEXT,
    "preparedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "sourceSystem" "SourceSystem" NOT NULL,
    "entityId" TEXT,
    "periodId" TEXT,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'RECEIVED',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationIssue" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "field" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TbSubmission" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "batchId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "reportingCurrency" TEXT NOT NULL DEFAULT 'USD',
    "translationSource" "TranslationSource" NOT NULL DEFAULT 'NONE',
    "supersedesId" TEXT,
    "preparedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TbSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TbLine" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "debit" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "balance" DECIMAL(20,6) NOT NULL,
    "reportingBalance" DECIMAL(20,6) NOT NULL,
    "rate" DECIMAL(18,8),
    "rateType" "RateType",

    CONSTRAINT "TbLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "rateType" "RateType" NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "rateDate" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UserScope_userId_entityId_key" ON "UserScope"("userId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_objectType_objectId_idx" ON "AuditLog"("objectType", "objectId");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_code_key" ON "Entity"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_databookName_key" ON "Entity"("databookName");

-- CreateIndex
CREATE INDEX "Entity_parentId_idx" ON "Entity"("parentId");

-- CreateIndex
CREATE INDEX "Ownership_parentId_idx" ON "Ownership"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Ownership_childId_effectiveFrom_key" ON "Ownership"("childId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_key_key" ON "AccountingPeriod"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_fiscalYear_month_key" ON "AccountingPeriod"("fiscalYear", "month");

-- CreateIndex
CREATE UNIQUE INDEX "EntityPeriod_entityId_periodId_key" ON "EntityPeriod"("entityId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "StatementLine_code_key" ON "StatementLine"("code");

-- CreateIndex
CREATE INDEX "StatementLine_statement_sortOrder_idx" ON "StatementLine"("statement", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StatementLine_statement_nameEn_key" ON "StatementLine"("statement", "nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "StdAccount_code_key" ON "StdAccount"("code");

-- CreateIndex
CREATE INDEX "StdAccount_statementLineId_idx" ON "StdAccount"("statementLineId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceAccount_entityId_code_key" ON "SourceAccount"("entityId", "code");

-- CreateIndex
CREATE INDEX "AccountMapping_stdAccountId_idx" ON "AccountMapping"("stdAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMapping_sourceAccountId_effectiveFrom_key" ON "AccountMapping"("sourceAccountId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ImportBatch_sha256_idx" ON "ImportBatch"("sha256");

-- CreateIndex
CREATE INDEX "ImportBatch_entityId_periodId_idx" ON "ImportBatch"("entityId", "periodId");

-- CreateIndex
CREATE INDEX "ValidationIssue_batchId_idx" ON "ValidationIssue"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "TbSubmission_supersedesId_key" ON "TbSubmission"("supersedesId");

-- CreateIndex
CREATE INDEX "TbSubmission_periodId_status_idx" ON "TbSubmission"("periodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TbSubmission_entityId_periodId_version_key" ON "TbSubmission"("entityId", "periodId", "version");

-- CreateIndex
CREATE INDEX "TbLine_sourceAccountId_idx" ON "TbLine"("sourceAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "TbLine_submissionId_sourceAccountId_key" ON "TbLine"("submissionId", "sourceAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_fromCurrency_toCurrency_periodId_rateType_key" ON "ExchangeRate"("fromCurrency", "toCurrency", "periodId", "rateType");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ownership" ADD CONSTRAINT "Ownership_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ownership" ADD CONSTRAINT "Ownership_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ownership" ADD CONSTRAINT "Ownership_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityPeriod" ADD CONSTRAINT "EntityPeriod_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityPeriod" ADD CONSTRAINT "EntityPeriod_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityPeriod" ADD CONSTRAINT "EntityPeriod_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StdAccount" ADD CONSTRAINT "StdAccount_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "StatementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceAccount" ADD CONSTRAINT "SourceAccount_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceAccount" ADD CONSTRAINT "SourceAccount_icCounterpartyId_fkey" FOREIGN KEY ("icCounterpartyId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMapping" ADD CONSTRAINT "AccountMapping_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "SourceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMapping" ADD CONSTRAINT "AccountMapping_stdAccountId_fkey" FOREIGN KEY ("stdAccountId") REFERENCES "StdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMapping" ADD CONSTRAINT "AccountMapping_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMapping" ADD CONSTRAINT "AccountMapping_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationIssue" ADD CONSTRAINT "ValidationIssue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TbSubmission" ADD CONSTRAINT "TbSubmission_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TbSubmission" ADD CONSTRAINT "TbSubmission_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TbSubmission" ADD CONSTRAINT "TbSubmission_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TbSubmission" ADD CONSTRAINT "TbSubmission_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "TbSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TbSubmission" ADD CONSTRAINT "TbSubmission_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TbSubmission" ADD CONSTRAINT "TbSubmission_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TbLine" ADD CONSTRAINT "TbLine_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TbSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TbLine" ADD CONSTRAINT "TbLine_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "SourceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────── Hand-written controls (not expressible in Prisma) ───────────────

-- The audit log is append-only. Corrections are new rows, never edits.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- At most one approved trial balance per entity and period.
CREATE UNIQUE INDEX "TbSubmission_one_approved"
  ON "TbSubmission" ("entityId", "periodId") WHERE "status" = 'APPROVED';

-- A committed file cannot be committed again for the same entity and period.
CREATE UNIQUE INDEX "ImportBatch_one_commit_per_file"
  ON "ImportBatch" ("sha256", COALESCE("entityId", ''), COALESCE("periodId", '')) WHERE "status" = 'COMMITTED';

-- Ownership is a percentage.
ALTER TABLE "Ownership" ADD CONSTRAINT "Ownership_percent_range" CHECK ("percent" >= 0 AND "percent" <= 100);

-- A TB line's balance is debit minus credit.
ALTER TABLE "TbLine" ADD CONSTRAINT "TbLine_balance_is_dr_minus_cr" CHECK ("balance" = "debit" - "credit");
