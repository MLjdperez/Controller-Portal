-- Questions sent to Claude (Anthropic API) are recorded in the audit trail.
ALTER TYPE "AuditAction" ADD VALUE 'AI_QUERY';
