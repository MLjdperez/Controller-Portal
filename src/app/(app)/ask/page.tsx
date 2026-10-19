import { requirePagePermission } from '@/lib/auth';
import { messages } from '@/lib/i18n';
import { ASK_MODEL } from '@/lib/ask/ask';
import { AskForm } from './ask-form';

export const dynamic = 'force-dynamic';

export default async function AskPage() {
  const s = await requirePagePermission('VIEW_STATEMENTS');
  const t = messages(s.locale).ask;
  const configured = !!process.env.ANTHROPIC_API_KEY;
  return (
    <>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{t.title}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{t.intro}</p>
      <p className="notice">{t.dataNotice.replace('{model}', ASK_MODEL)}</p>
      {!configured ? <p className="notice error-notice">{t.errors.NOT_CONFIGURED}</p> : (
        <AskForm t={{
          placeholder: t.placeholder, submit: t.submit, thinking: t.thinking, examples: t.examples, exampleTitle: t.exampleTitle,
          errors: t.errors, toolsUsed: t.toolsUsed, answerTitle: t.answerTitle,
        }} />
      )}
    </>
  );
}
