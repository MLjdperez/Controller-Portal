'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { importDatabookBatch, receiveDatabook } from '@/lib/databook/upload';

export async function uploadDatabookAction(form: FormData) {
  const s = await requirePermission('ADMIN_COA');
  const file = form.get('file');
  if (!(file instanceof File)) redirect('/admin/databook?error=EMPTY');
  const r = await receiveDatabook(db, s, { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  revalidatePath('/admin/databook');
  redirect(r.ok ? `/admin/databook/${r.batchId}` : `/admin/databook?error=${r.error}`);
}

export async function importDatabookAction(form: FormData) {
  const s = await requirePermission('ADMIN_COA');
  const batchId = String(form.get('batchId') ?? '');
  const through = String(form.get('through') ?? '');
  const r = await importDatabookBatch(db, s, { batchId, through, acknowledgement: String(form.get('acknowledgement') ?? '') });
  revalidatePath('/', 'layout');
  const q = r.ok
    ? `imported=${r.summary.status === 'DUPLICATE' ? 'duplicate' : `${r.summary.submissionsCreated}.${r.summary.submissionsUnchanged}`}`
    : `error=${r.error}`;
  redirect(`/admin/databook/${encodeURIComponent(batchId)}?through=${encodeURIComponent(through)}&${q}`);
}
