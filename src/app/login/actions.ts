'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { signIn } from '@/lib/auth';

const Form = z.object({ email: z.string().email(), password: z.string().min(1) });

export type LoginState = { error?: 'INVALID' | 'LOCKED' | 'INACTIVE' };

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const parsed = Form.safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return { error: 'INVALID' };
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
  const result = await signIn(parsed.data.email, parsed.data.password, ip, h.get('user-agent') ?? undefined);
  if (!result.ok) return { error: result.reason };
  redirect('/');
}
