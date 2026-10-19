// User administration rules, enforced on the server (master prompt §19).
import type { PrismaClient, RoleCode, Locale } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { audit } from './audit-core';
import type { Approver } from './approvals';

export const NewUser = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(['CONTROLLER', 'CFO', 'COLLABORATOR', 'AUDITOR']),
  locale: z.enum(['en', 'es']),
  entityIds: z.array(z.string().min(1)).min(1),
  includeDescendants: z.boolean(),
});

export type CreateResult = { ok: true; email: string; initialPassword: string } | { ok: false; error: 'EXISTS' | 'INVALID' | 'NO_ENTITY' | 'ROLE_NOT_ALLOWED' | 'FORBIDDEN' };

type Admin = Approver & { roles: RoleCode[] };

/** Only a Controller may create a Controller, and nobody may grant entities outside their own access. */
export function checkCreate(admin: Admin, role: RoleCode, entityIds: string[]): CreateResult | null {
  if (!admin.permissions.has('ADMIN_USERS')) return { ok: false, error: 'FORBIDDEN' };
  if (role === 'CONTROLLER' && !admin.roles.includes('CONTROLLER')) return { ok: false, error: 'ROLE_NOT_ALLOWED' };
  if (!entityIds.length || entityIds.some(id => !admin.entityIds.includes(id))) return { ok: false, error: 'NO_ENTITY' };
  return null;
}

export async function createUser(db: PrismaClient, admin: Admin, input: unknown): Promise<CreateResult> {
  const parsed = NewUser.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some(i => i.path[0] === 'entityIds') ? 'NO_ENTITY' : 'INVALID' };
  const u = parsed.data;
  const refused = checkCreate(admin, u.role, u.entityIds);
  if (refused) return refused;
  if (await db.user.findUnique({ where: { email: u.email } })) return { ok: false, error: 'EXISTS' };

  const initialPassword = randomBytes(12).toString('base64url');
  await db.$transaction(async tx => {
    const role = await tx.role.findUniqueOrThrow({ where: { code: u.role } });
    const user = await tx.user.create({ data: {
      email: u.email, fullName: u.fullName, locale: u.locale as Locale,
      passwordHash: await bcrypt.hash(initialPassword, 12), mustChangePassword: true,
      roles: { create: { roleId: role.id } },
      scopes: { create: u.entityIds.map(entityId => ({ entityId, includeDescendants: u.includeDescendants })) },
    } });
    await audit(tx, { userId: admin.id, action: 'CREATE', objectType: 'User', objectId: user.id,
      summary: `Created ${u.email} as ${u.role}`, after: { email: u.email, role: u.role, entityIds: u.entityIds, includeDescendants: u.includeDescendants } });
  });
  return { ok: true, email: u.email, initialPassword };
}

export async function setActive(db: PrismaClient, admin: Admin, userId: string, active: boolean): Promise<{ ok: boolean; error?: 'SELF' | 'FORBIDDEN' }> {
  if (!admin.permissions.has('ADMIN_USERS')) return { ok: false, error: 'FORBIDDEN' };
  if (userId === admin.id && !active) return { ok: false, error: 'SELF' };
  await db.$transaction(async tx => {
    await tx.user.update({ where: { id: userId }, data: { isActive: active } });
    // Deactivation ends every session at once.
    if (!active) await tx.session.deleteMany({ where: { userId } });
    await audit(tx, { userId: admin.id, action: 'UPDATE', objectType: 'User', objectId: userId,
      summary: active ? 'Reactivated user' : 'Deactivated user', after: { isActive: active } });
  });
  return { ok: true };
}
