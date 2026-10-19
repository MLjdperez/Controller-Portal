// "Ask Claude": a question about the statements, answered by Claude Opus 5.5 with read-only tools.
// The Controller approved sending statement and account data to Anthropic's API (2026-10-19).
// Every question is recorded in the audit log with the tools called, the data sent and the outcome.

import Anthropic from '@anthropic-ai/sdk';
import type { PrismaClient } from '@prisma/client';
import { audit } from '../audit-core';
import { EBITDA_DEFINITION, BS_LINES, PL_LINES } from '../statements/layout';
import { runTool, TOOL_DEFS, type AskScope } from './tools';

export const ASK_MODEL = 'claude-opus-5-5';
const MAX_TOOL_ROUNDS = 8;
const MAX_QUESTION = 2000;

export type AskResult =
  | { ok: true; answer: string; toolCalls: number; model: string }
  | { ok: false; error: 'NOT_CONFIGURED' | 'TOO_LONG' | 'EMPTY' | 'REFUSED' | 'TOO_MANY_STEPS' | 'API_ERROR' | 'RATE_LIMITED' };

/** Stable across requests (no dates, no user data) so it caches; the per-user part goes in the user turn. */
function systemPrompt(): string {
  const lines = (ls: typeof BS_LINES) => ls.map(l => `${l.code} = ${l.nameEn}`).join('; ');
  return [
    'You answer questions from the Controller and CFO of the Mama Lycha Group about its financial statements.',
    'Group: MLB (ML Buyer, parent) owns 100% of MLF (Mama Lycha Foods, Sage 100); MLF owns 100% of MLL (Mama Lycha Logistics, QuickBooks), ' +
      'GSA (Gotera, El Salvador) and LSA (Lunic, Nicaragua; functional currency NIO, figures already in USD as delivered). ELIM holds consolidation eliminations; ' +
      'CONSOLIDATED = sum of all entities including ELIM. All amounts are USD.',
    'Use the tools for every figure you state. Never estimate or invent a number; if the data is missing, say so. Quote figures with their period, ' +
      'entity and whether they are year to date or a single month.',
    'Tool figures use natural signs: revenue, profit, assets, liabilities and equity positive; costs negative; a negative net income is a loss. ' +
      'get_account_history is the exception and uses raw signs (debit positive).',
    `EBITDA definition (non-GAAP, as the Databook reports it): ${EBITDA_DEFINITION.sourceEn}.`,
    'If a tool reports the figures as PRELIMINARY, say so once, briefly, in the answer.',
    'Answer in the language the question is asked in (English or Spanish). Be concise: lead with the answer, then the few figures that support it. ' +
      'Write plain text: short paragraphs and simple "-" lists, no markdown tables, headings or bold.',
    `Statement line codes. BS: ${lines(BS_LINES)}. PL: ${lines(PL_LINES)}; PL.EBITDA = EBITDA, reported.`,
  ].join('\n\n');
}

export async function ask(db: PrismaClient, args: {
  userId: string; question: string; scope: AskScope; loadedPeriods: string[];
}): Promise<AskResult> {
  const question = args.question.trim();
  if (!question) return { ok: false, error: 'EMPTY' };
  if (question.length > MAX_QUESTION) return { ok: false, error: 'TOO_LONG' };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'NOT_CONFIGURED' };

  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{
    role: 'user',
    content: `Entities you may report on: ${args.scope.entityCodes.join(', ')}${args.scope.canConsolidate ? ', CONSOLIDATED' : ''}. ` +
      `Periods with data: ${args.loadedPeriods[0]} to ${args.loadedPeriods.at(-1)}.\n\nQuestion: ${question}`,
  }];
  const toolLog: { name: string; input: unknown; error: boolean }[] = [];
  let outcome: AskResult = { ok: false, error: 'TOO_MANY_STEPS' };
  let usage = { input: 0, output: 0, cacheRead: 0 };
  let model = ASK_MODEL;

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.beta.messages.create({
        model: ASK_MODEL,
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        // A safety-filter decline is retried server-side on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }],
        tools: TOOL_DEFS,
        messages,
      });
      model = response.model;
      usage = { input: usage.input + response.usage.input_tokens, output: usage.output + response.usage.output_tokens,
        cacheRead: usage.cacheRead + (response.usage.cache_read_input_tokens ?? 0) };

      if (response.stop_reason === 'refusal') { outcome = { ok: false, error: 'REFUSED' }; break; }
      if (response.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: response.content }); continue; }

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const answer = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join('\n').trim();
        outcome = { ok: true, answer, toolCalls: toolLog.length, model };
        break;
      }
      if (round === MAX_TOOL_ROUNDS) break;

      // Echo the assistant turn unchanged (thinking blocks included), then return every result in one user message.
      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const t of toolUses) {
        const r = await runTool(db, args.scope, t.name, t.input);
        toolLog.push({ name: t.name, input: t.input, error: r.isError });
        results.push({ type: 'tool_result', tool_use_id: t.id, content: r.content, is_error: r.isError });
      }
      messages.push({ role: 'user', content: results });
    }
  } catch (e) {
    outcome = { ok: false, error: e instanceof Anthropic.RateLimitError ? 'RATE_LIMITED' : 'API_ERROR' };
    if (!(e instanceof Anthropic.APIError)) console.error('ask failed', e);
  }

  await audit(db, {
    userId: args.userId, action: 'AI_QUERY', objectType: 'AskClaude',
    summary: `Asked Claude (${model}): ${question.slice(0, 200)}${question.length > 200 ? '…' : ''} → ${outcome.ok ? 'answered' : outcome.error}`,
    after: { question, outcome: outcome.ok ? 'ANSWERED' : outcome.error, model, tools: toolLog, usage,
      sentToAnthropic: 'question plus tool results (statement lines, account balances) for the entities in scope' } as never,
  });
  return outcome;
}
