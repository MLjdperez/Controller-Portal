'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession, signOut } from '@/lib/auth';
import { db } from '@/lib/db';

export async function logout() {
  await signOut();
  redirect('/login');
}

export async function setLocale(form: FormData) {
  const s = await requireSession();
  const locale = form.get('locale') === 'es' ? 'es' : 'en';
  await db.user.update({ where: { id: s.id }, data: { locale } });
  revalidatePath('/', 'layout');
}
