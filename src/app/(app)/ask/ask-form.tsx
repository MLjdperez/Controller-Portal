'use client';
import { useActionState, useRef } from 'react';
import { askAction, type AskState } from './actions';

type Labels = {
  placeholder: string; submit: string; thinking: string; examples: string[]; exampleTitle: string;
  errors: Record<string, string>; toolsUsed: string; answerTitle: string;
};

export function AskForm({ t }: { t: Labels }) {
  const [state, action, pending] = useActionState<AskState, FormData>(askAction, {});
  const box = useRef<HTMLTextAreaElement>(null);
  const r = state.result;
  return (
    <>
      <form action={action}>
        <textarea ref={box} name="question" rows={3} maxLength={2000} required placeholder={t.placeholder}
          defaultValue={state.question ?? ''} className="ask-box" />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" disabled={pending}>{pending ? t.thinking : t.submit}</button>
          {pending && <span className="muted" role="status">{t.thinking}</span>}
        </div>
      </form>

      {!pending && r && (r.ok ? (
        <section className="card answer" aria-live="polite">
          <h3 style={{ marginTop: 0 }}>{t.answerTitle}</h3>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{r.answer}</div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>{t.toolsUsed.replace('{n}', String(r.toolCalls)).replace('{model}', r.model)}</p>
        </section>
      ) : <p className="notice error-notice" role="alert">{t.errors[r.error] ?? r.error}</p>)}

      <div style={{ marginTop: 24 }}>
        <p className="muted" style={{ marginBottom: 6 }}>{t.exampleTitle}</p>
        <div className="examples">
          {t.examples.map(e => (
            <button key={e} type="button" className="secondary" onClick={() => { if (box.current) { box.current.value = e; box.current.focus(); } }}>{e}</button>
          ))}
        </div>
      </div>
    </>
  );
}
