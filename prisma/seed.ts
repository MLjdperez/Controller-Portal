// Reference data. Safe to re-run: every write is an upsert keyed on a stable code.
import { PrismaClient, type RoleCode } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import {
  ENTITIES, OWNERSHIP, OWNERSHIP_BASIS, OWNERSHIP_EFFECTIVE_FROM, ROLES, periodKeys,
} from '../src/lib/reference';

const db = new PrismaClient();

async function main() {
  // Roles and their permissions. Permissions are replaced wholesale so removals take effect.
  for (const [code, r] of Object.entries(ROLES) as [RoleCode, (typeof ROLES)[RoleCode]][]) {
    const role = await db.role.upsert({
      where: { code }, update: { nameEn: r.nameEn, nameEs: r.nameEs },
      create: { code, nameEn: r.nameEn, nameEs: r.nameEs },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({ data: r.permissions.map(permission => ({ roleId: role.id, permission })) });
  }

  // Entities: parents first, so the parent id exists.
  const ids = new Map<string, string>();
  for (const e of ENTITIES) {
    const data = {
      legalName: e.legalName, shortName: e.shortName, databookName: e.databookName, kind: e.kind,
      country: e.country, functionalCurrency: e.functionalCurrency, sourceSystem: e.sourceSystem,
      sageCompanyCode: e.sageCompanyCode ?? null, sortOrder: e.sortOrder,
      parentId: e.parent ? ids.get(e.parent)! : null,
    };
    const row = await db.entity.upsert({ where: { code: e.code }, update: data, create: { code: e.code, ...data } });
    ids.set(e.code, row.id);
  }

  // Periods, and an OPEN status row per entity.
  for (const p of periodKeys()) {
    const startDate = new Date(Date.UTC(p.fiscalYear, p.month - 1, 1));
    const endDate = new Date(Date.UTC(p.fiscalYear, p.month, 0));
    const period = await db.accountingPeriod.upsert({
      where: { key: p.key }, update: {},
      create: { ...p, startDate, endDate },
    });
    for (const entityId of ids.values())
      await db.entityPeriod.upsert({
        where: { entityId_periodId: { entityId, periodId: period.id } }, update: {},
        create: { entityId, periodId: period.id },
      });
  }

  // First Controller account. The password is generated, never committed.
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').toLowerCase().trim();
  let admin = email ? await db.user.findUnique({ where: { email } }) : null;
  if (email && !admin) {
    const password = randomBytes(12).toString('base64url');
    admin = await db.user.create({
      data: {
        email, fullName: process.env.SEED_ADMIN_NAME ?? 'Controller',
        passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true,
      },
    });
    const file = 'credentials.local.csv';
    if (!existsSync(file)) writeFileSync(file, 'email,initialPassword\n');
    appendFileSync(file, `${email},${password}\n`);
    console.log(`Created ${email}; initial password written to ${file}. Distribute, then delete the file.`);
  }
  if (admin) {
    const role = await db.role.findUniqueOrThrow({ where: { code: 'CONTROLLER' } });
    await db.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: role.id } }, update: {},
      create: { userId: admin.id, roleId: role.id },
    });
    for (const code of ['MLB', 'ELIM'])
      await db.userScope.upsert({
        where: { userId_entityId: { userId: admin.id, entityId: ids.get(code)! } },
        update: { includeDescendants: true },
        create: { userId: admin.id, entityId: ids.get(code)!, includeDescendants: true },
      });
  }

  // Ownership: approved by the Controller in the 2026-10-19 decision record.
  for (const o of OWNERSHIP) {
    const childId = ids.get(o.child)!;
    const effectiveFrom = new Date(OWNERSHIP_EFFECTIVE_FROM);
    await db.ownership.upsert({
      where: { childId_effectiveFrom: { childId, effectiveFrom } }, update: {},
      create: {
        parentId: ids.get(o.parent)!, childId, percent: o.percent, effectiveFrom, basis: OWNERSHIP_BASIS,
        approvedById: admin?.id ?? null, approvedAt: admin ? new Date() : null,
      },
    });
  }

  const counts = {
    roles: await db.role.count(), entities: await db.entity.count(), periods: await db.accountingPeriod.count(),
    entityPeriods: await db.entityPeriod.count(), ownership: await db.ownership.count(), users: await db.user.count(),
  };
  console.log('Seed complete', counts);
}

main().finally(() => db.$disconnect());
