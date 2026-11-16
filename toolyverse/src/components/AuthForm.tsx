'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { login, signup, type FormState } from '@/lib/auth/actions';

export function AuthForm({ kind, next }: { kind: 'login' | 'signup'; next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(kind === 'login' ? login : signup, undefined);
  const q = next ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {kind === 'signup' && (
        <label className="block">
          <span className="label mb-1 block">Your name</span>
          <input name="name" autoComplete="name" required className="field" defaultValue={state?.fields?.name} />
        </label>
      )}
      <label className="block">
        <span className="label mb-1 block">Email</span>
        <input name="email" type="email" autoComplete="email" required className="field" defaultValue={state?.fields?.email} />
      </label>
      <label className="block">
        <span className="label mb-1 block">Password</span>
        <input name="password" type="password" autoComplete={kind === 'login' ? 'current-password' : 'new-password'} required minLength={kind === 'signup' ? 8 : undefined} className="field" />
        {kind === 'signup' && <span className="mt-1 block text-[0.8rem] text-ink-3">At least 8 characters.</span>}
      </label>
      {state?.error && (
        <p role="alert" className="border-l-[3px] border-bad bg-card px-3 py-2 text-[0.92rem] text-bad">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn w-full" disabled={pending}>
        {pending ? 'Please wait…' : kind === 'login' ? 'Log in' : 'Create free account'}
      </button>
      <p className="text-center text-[0.92rem] text-ink-2">
        {kind === 'login' ? (
          <>
            New here?{' '}
            <Link href={`/signup${q}`} className="font-semibold text-ink underline underline-offset-2">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href={`/login${q}`} className="font-semibold text-ink underline underline-offset-2">
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
