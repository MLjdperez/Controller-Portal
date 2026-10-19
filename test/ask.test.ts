import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { runTool, TOOL_DEFS } from '@/lib/ask/tools';
import { ask } from '@/lib/ask/ask';

// A database that fails the test if touched: these checks must refuse before any query runs.
const noDb = new Proxy({}, { get: () => { throw new Error('database must not be used'); } }) as unknown as PrismaClient;
const gsaOnly = { entityCodes: ['GSA'], canConsolidate: false };

describe('Ask Claude tools: scope and validation', () => {
  it('refuses another entity’s accounts without querying', async () => {
    const r = await runTool(noDb, gsaOnly, 'get_line_accounts', { period: '2026-09', line_code: 'PL.PRODUCT_SALES', entity: 'MLF', limit: 10 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not available/);
  });
  it('refuses the consolidated column to a user without every entity', async () => {
    const r = await runTool(noDb, gsaOnly, 'get_line_accounts', { period: '2026-09', line_code: 'PL.EBITDA', entity: 'CONSOLIDATED', limit: 5 });
    expect(JSON.parse(r.content).error).toMatch(/not available/);
  });
  it('refuses another entity’s account history', async () => {
    const r = await runTool(noDb, gsaOnly, 'get_account_history', { entity: 'LSA', account_code: '110101002' });
    expect(JSON.parse(r.content).error).toMatch(/not available/);
  });
  it('returns validation errors as tool errors, not exceptions', async () => {
    const r = await runTool(noDb, gsaOnly, 'get_statement', { period: 'Sept 2026', statement: 'PL', view: 'ytd' });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/YYYY-MM/);
  });
  it('lists valid line codes when Claude names an unknown one', async () => {
    const r = await runTool(noDb, gsaOnly, 'get_line_accounts', { period: '2026-09', line_code: 'PL.SALES', entity: 'GSA', limit: 5 });
    expect(JSON.parse(r.content).valid_codes).toContain('PL.PRODUCT_SALES');
  });
  it('rejects unknown tools', async () => {
    expect((await runTool(noDb, gsaOnly, 'delete_everything', {})).isError).toBe(true);
  });
  it('tools are strict and read-only by name', () => {
    for (const t of TOOL_DEFS) {
      expect(t.strict).toBe(true);
      expect(t.input_schema.additionalProperties).toBe(false);
      expect(t.name).toMatch(/^get_/);
    }
  });
});

describe('ask(): guards before calling the API', () => {
  const base = { userId: 'u', scope: gsaOnly, loadedPeriods: ['2024-12', '2026-09'] };
  it('empty and over-long questions never reach the API', async () => {
    expect(await ask(noDb, { ...base, question: '   ' })).toEqual({ ok: false, error: 'EMPTY' });
    expect(await ask(noDb, { ...base, question: 'x'.repeat(2001) })).toEqual({ ok: false, error: 'TOO_LONG' });
  });
  it('without an API key it reports NOT_CONFIGURED', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(await ask(noDb, { ...base, question: 'What was EBITDA?' })).toEqual({ ok: false, error: 'NOT_CONFIGURED' });
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
