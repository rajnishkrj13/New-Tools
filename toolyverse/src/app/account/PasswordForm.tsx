'use client';

import { useActionState } from 'react';

type State = { error?: string; ok?: boolean } | undefined;

export function PasswordForm({ action }: { action: (s: State, f: FormData) => Promise<State> }) {
  const [state, run, pending] = useActionState<State, FormData>(action, undefined);
  return (
    <form action={run} className="mt-3 space-y-3">
      <input name="current" type="password" autoComplete="current-password" placeholder="Current password" className="field" required />
      <input name="next" type="password" autoComplete="new-password" placeholder="New password (8+ characters)" className="field" required minLength={8} />
      <button className="btn" type="submit" disabled={pending}>
        Change password
      </button>
      {state?.error && <p className="text-[0.9rem] text-bad">{state.error}</p>}
      {state?.ok && <p className="text-[0.9rem] text-ok">Password changed. Other devices have been signed out.</p>}
    </form>
  );
}
