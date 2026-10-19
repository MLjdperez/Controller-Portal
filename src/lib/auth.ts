// Ported from ML-Group-Corporate-Budget src/lib/auth.ts (handoff D5), with scope grants that
// cascade only when the grant says so (src/lib/scope.ts).
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Locale, Permission, RoleCode } from '@prisma/client';
import { db } from './db';
import { audit } from './audit';
import { reachableEntityIds } from './scope';

const COOKIE = 'mlcp_session';
const SESSION_HOURS = 12;
const MAX_FAILED = 5;
const LOCKOUT_MINUTES = 15;
const MIN_PASSWORD = 12;

/** Sessions are stored hashed, so a leaked database row is not a live session. */
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  locale: Locale;
  mustChangePassword: boolean;
  roles: RoleCode[];
  permissions: Set<Permission>;
  /** Entity ids this user may see. Empty means none — never means all. */
  entityIds: string[];
};

export async function getSession(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { include: { roles: { include: { role: { include: { permissions: true } } } }, scopes: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;

  // Touch at most once a minute; every page load would be a pointless write.
  if (Date.now() - session.lastSeenAt.getTime() > 60_000)
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });

  const u = session.user;
  const permissions = new Set<Permission>();
  for (const ur of u.roles) for (const p of ur.role.permissions) permissions.add(p.permission);

  const tree = u.scopes.some(s => s.includeDescendants)
    ? await db.entity.findMany({ select: { id: true, parentId: true } })
    : [];

  return {
    id: u.id, email: u.email, fullName: u.fullName, locale: u.locale,
    mustChangePassword: u.mustChangePassword,
    roles: u.roles.map(r => r.role.code),
    permissions,
    entityIds: reachableEntityIds(u.scopes, tree),
  };
}

export class AuthError extends Error {
  constructor(public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN', detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new AuthError('UNAUTHENTICATED');
  return s;
}

/**
 * For pages: a missing session goes to sign-in instead of throwing (the layout redirects too, but pages render
 * in parallel with it). A missing permission still throws: that's a 403, not a sign-in problem.
 */
export async function requirePagePermission(permission?: Permission): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (permission && !s.permissions.has(permission)) throw new AuthError('FORBIDDEN', permission);
  return s;
}

/** Server-side gate for every protected action: permission, and the entity when one is involved. */
export async function requirePermission(permission: Permission, entityId?: string): Promise<SessionUser> {
  const s = await requireSession();
  if (!s.permissions.has(permission)) throw new AuthError('FORBIDDEN', permission);
  if (entityId && !s.entityIds.includes(entityId)) throw new AuthError('FORBIDDEN', 'entity out of scope');
  return s;
}

type SignInResult =
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; reason: 'INVALID' | 'LOCKED' | 'INACTIVE' };

export async function signIn(email: string, password: string, ip?: string, userAgent?: string): Promise<SignInResult> {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });

  // Always spend the cost of a hash, even for an unknown address, so timing doesn't reveal which addresses exist.
  const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const matches = await bcrypt.compare(password, hash);

  if (!user) return { ok: false, reason: 'INVALID' };
  if (!user.isActive) return { ok: false, reason: 'INACTIVE' };
  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, reason: 'LOCKED' };

  if (!matches) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });
    await audit({ action: 'LOGIN_FAILED', objectType: 'User', objectId: user.id, userId: user.id,
      summary: `Failed sign-in (${failed}/${MAX_FAILED})`, ipAddress: ip });
    return { ok: false, reason: failed >= MAX_FAILED ? 'LOCKED' : 'INVALID' };
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  await db.$transaction(async tx => {
    await tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await tx.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt, ipAddress: ip, userAgent } });
    await audit({ action: 'LOGIN', objectType: 'User', objectId: user.id, userId: user.id,
      summary: 'Signed in', ipAddress: ip }, tx);
  });

  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: expiresAt,
  });
  return { ok: true, mustChangePassword: user.mustChangePassword };
}

export async function signOut() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) {
    const s = await db.session.findUnique({ where: { tokenHash: hashToken(raw) } });
    if (s) {
      await db.session.delete({ where: { id: s.id } });
      await audit({ action: 'LOGOUT', objectType: 'User', objectId: s.userId, userId: s.userId, summary: 'Signed out' });
    }
  }
  jar.delete(COOKIE);
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(current, user.passwordHash))) return { ok: false as const, reason: 'WRONG_CURRENT' as const };
  if (next.length < MIN_PASSWORD) return { ok: false as const, reason: 'TOO_SHORT' as const };

  await db.$transaction(async tx => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(next, 12), mustChangePassword: false },
    });
    // Every session dies with the old password.
    await tx.session.deleteMany({ where: { userId } });
    await audit({ action: 'UPDATE', objectType: 'User', objectId: userId, userId, summary: 'Changed password' }, tx);
  });
  return { ok: true as const };
}
