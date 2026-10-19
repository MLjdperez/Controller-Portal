'use server';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { createUser, setActive, type CreateResult } from '@/lib/users';

export type CreateState = { result?: CreateResult };

export async function createUserAction(_: CreateState, form: FormData): Promise<CreateState> {
  const s = await requirePermission('ADMIN_USERS');
  const result = await createUser(db, s, {
    email: form.get('email'), fullName: form.get('fullName'), role: form.get('role'), locale: form.get('locale'),
    entityIds: form.getAll('entityIds').filter(x => typeof x === 'string'),
    includeDescendants: form.get('includeDescendants') === 'on',
  });
  revalidatePath('/admin/users');
  return { result };
}

export async function setActiveAction(form: FormData) {
  const s = await requirePermission('ADMIN_USERS');
  await setActive(db, s, String(form.get('id')), form.get('active') === 'true');
  revalidatePath('/admin/users');
}
