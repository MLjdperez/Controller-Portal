'use client';
import { useActionState } from 'react';
import { createUserAction, type CreateState } from './actions';
import type { Messages } from '@/messages/en';

/** Labels only: functions can't cross into a client component, so "created" arrives as a template. */
type Labels = Omit<Messages['users'], 'created'> & { created: string };

type Props = {
  t: Labels;
  roles: { code: string; name: string }[];
  entities: { id: string; code: string; name: string }[];
};

export function CreateUserForm({ t, roles, entities }: Props) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createUserAction, {});
  const r = state.result;
  return (
    <form action={action} className="card" style={{ maxWidth: 640 }}>
      <h3 style={{ marginTop: 0 }}>{t.create}</h3>
      {r?.ok && (
        <div className="notice" role="status">
          {t.created.replace('{email}', r.email)} <code style={{ fontSize: 15, userSelect: 'all' }}>{r.initialPassword}</code>
        </div>
      )}
      {r && !r.ok && <p className="error" role="alert">{t.errors[r.error] ?? r.error}</p>}
      <label htmlFor="email">{t.email}</label>
      <input id="email" name="email" type="email" required style={{ width: '100%' }} />
      <label htmlFor="fullName">{t.name}</label>
      <input id="fullName" name="fullName" required style={{ width: '100%' }} />
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <label htmlFor="role">{t.role}</label>
          <select id="role" name="role" defaultValue="COLLABORATOR">
            {roles.map(x => <option key={x.code} value={x.code}>{x.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="locale">{t.language}</label>
          <select id="locale" name="locale" defaultValue="en"><option value="en">English</option><option value="es">Español</option></select>
        </div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
        <legend style={{ fontSize: 13 }}>{t.entities}</legend>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {entities.map(e => (
            <label key={e.id} style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }} title={e.name}>
              <input type="checkbox" name="entityIds" value={e.id} aria-label={e.code} /> {e.code}
            </label>
          ))}
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" name="includeDescendants" defaultChecked /> {t.includeSubs}
        </label>
      </fieldset>
      <button type="submit" disabled={pending}>{t.create}</button>
    </form>
  );
}
