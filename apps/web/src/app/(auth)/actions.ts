'use server';

import { redirect } from 'next/navigation';
import {
  forgotPasswordFlow,
  resendVerificationFlow,
  resetPasswordFlow,
  signInFlow,
  signUpFlow,
  type FormState,
} from '@/server/auth-flows';
import { dbLoginThrottle, supabaseAuthProvider } from '@/server/supabase-auth';

const appUrl = () => process.env.APP_URL ?? 'http://localhost:3000';
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '');

export async function signUpAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, 'email');
  const r = await signUpFlow(
    await supabaseAuthProvider(),
    {
      fullName: str(fd, 'fullName'),
      email,
      password: str(fd, 'password'),
      acceptTerms: fd.get('acceptTerms') === 'on',
    },
    appUrl(),
  );
  if (r.status === 'ok') redirect(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
  return r;
}

export async function signInAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await signInFlow(
    await supabaseAuthProvider(),
    { email: str(fd, 'email'), password: str(fd, 'password') },
    str(fd, 'next') || null,
    dbLoginThrottle(),
  );
  if (r.status === 'ok') redirect(r.next ?? '/overview');
  return r;
}

export async function resendVerificationAction(_: FormState, fd: FormData): Promise<FormState> {
  return resendVerificationFlow(await supabaseAuthProvider(), { email: str(fd, 'email') }, appUrl());
}

export async function forgotPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  return forgotPasswordFlow(await supabaseAuthProvider(), { email: str(fd, 'email') }, appUrl());
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await resetPasswordFlow(await supabaseAuthProvider(), {
    password: str(fd, 'password'),
    confirm: str(fd, 'confirm'),
  });
  if (r.status === 'ok') redirect('/overview');
  return r;
}
