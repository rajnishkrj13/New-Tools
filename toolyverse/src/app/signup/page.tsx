import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/AuthForm';
import { getViewer } from '@/lib/auth/session';
import { getSiteSetting } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Create a free account',
  description: 'A free Toolyverse account gives you larger file limits and keeps saved signatures and invoice details across your devices.',
  alternates: { canonical: '/signup' },
};

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const { next } = await searchParams;
  if (await getViewer()) redirect('/account');
  const open = await getSiteSetting('signupsOpen');
  return (
    <div className="mx-auto grid max-w-[920px] gap-10 px-4 pt-14 md:grid-cols-[1fr_420px]">
      <div>
        <p className="label">Free account</p>
        <h1 className="display mt-2 text-[2.6rem]">Keep your things, use bigger files</h1>
        <ul className="mt-6 space-y-3 text-ink-2">
          {[
            'Larger file limits on PDF and image tools.',
            'Tools marked “Members” are open to you.',
            'Saved signatures, details and invoice settings follow you to any device.',
            'Still no uploads: your files are processed on your own device.',
          ].map((t) => (
            <li key={t} className="flex gap-3">
              <span className="mt-[0.55rem] h-2 w-2 shrink-0 bg-signal" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="border border-ink bg-card p-6">
        {open ? <AuthForm kind="signup" next={typeof next === 'string' ? next : undefined} /> : <p className="text-ink-2">New sign-ups are paused at the moment. Please try again later.</p>}
      </div>
    </div>
  );
}
