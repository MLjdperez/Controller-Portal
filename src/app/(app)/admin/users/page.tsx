import { requirePagePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDate, messages } from '@/lib/i18n';
import { CreateUserForm } from './create-form';
import { setActiveAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const s = await requirePagePermission('ADMIN_USERS');
  const t = messages(s.locale);
  const tu = t.users;
  const users = await db.user.findMany({
    orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
    include: { roles: { include: { role: true } }, scopes: { include: { entity: { select: { code: true } } } } },
  });
  const roles = await db.role.findMany({ orderBy: { code: 'asc' } });
  const entities = await db.entity.findMany({ where: { id: { in: s.entityIds } }, orderBy: { sortOrder: 'asc' } });
  const roleName = (r: { nameEn: string; nameEs: string }) => (s.locale === 'es' ? r.nameEs : r.nameEn);

  return (
    <>
      <h2 style={{ margin: '0 0 16px', fontSize: 20 }}>{tu.title}</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>{tu.name}</th><th>{tu.email}</th><th>{tu.role}</th><th>{tu.entities}</th><th>{tu.lastLogin}</th><th /></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className={u.isActive ? '' : 'muted'}>
                <td>{u.fullName}{!u.isActive && <> · <span className="pill">{tu.inactive}</span></>}</td>
                <td>{u.email}</td>
                <td>{u.roles.map(r => roleName(r.role)).join(', ')}</td>
                <td>{u.scopes.map(x => `${x.entity.code}${x.includeDescendants ? '+' : ''}`).join(', ')}</td>
                <td>{u.lastLoginAt ? formatDate(u.lastLoginAt, s.locale) : tu.never}</td>
                <td>
                  {u.id !== s.id && (
                    <form action={setActiveAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="active" value={u.isActive ? 'false' : 'true'} />
                      <button type="submit" className="link">{u.isActive ? tu.deactivate : tu.reactivate}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>+ = {tu.includeSubs.toLowerCase()}</p>
      <div style={{ marginTop: 24 }}>
        <CreateUserForm t={{ ...tu, created: tu.created('{email}') }}
          roles={roles.filter(r => r.code !== 'CONTROLLER' || s.roles.includes('CONTROLLER')).map(r => ({ code: r.code, name: roleName(r) }))}
          entities={entities.map(e => ({ id: e.id, code: e.code, name: e.legalName }))} />
      </div>
    </>
  );
}
