'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { commitBatch, discardBatch, receiveUpload } from '@/lib/tb/upload';

export async function uploadAction(form: FormData) {
  const s = await requirePermission('UPLOAD_TB');
  const file = form.get('file');
  if (!(file instanceof File)) redirect('/trial-balances?error=EMPTY');
  const r = await receiveUpload(db, s, {
    entityCode: String(form.get('entity') ?? ''), periodKey: String(form.get('period') ?? ''),
    fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()),
  });
  revalidatePath('/trial-balances');
  redirect(r.ok ? `/trial-balances/batches/${r.batchId}` : `/trial-balances?error=${r.error}`);
}

export async function commitAction(form: FormData) {
  const s = await requirePermission('UPLOAD_TB');
  const batchId = String(form.get('batchId') ?? '');
  const mappings: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith('map:') && typeof v === 'string' && v) mappings[k.slice(4)] = v;
  const r = await commitBatch(db, s, batchId, mappings);
  revalidatePath('/', 'layout');
  redirect(`/trial-balances/batches/${encodeURIComponent(batchId)}?${r.ok ? `submitted=${r.version}` : `error=${r.error}`}`);
}

export async function discardAction(form: FormData) {
  const s = await requirePermission('UPLOAD_TB');
  await discardBatch(db, s, String(form.get('batchId') ?? ''));
  revalidatePath('/trial-balances');
  redirect('/trial-balances');
}
