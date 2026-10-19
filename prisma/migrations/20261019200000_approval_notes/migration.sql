-- Approval evidence: why an out-of-balance TB was accepted, and why a mapping was rejected.
ALTER TABLE "TbSubmission" ADD COLUMN "approvalNote" TEXT;
ALTER TABLE "AccountMapping" ADD COLUMN "rejectionReason" TEXT;
