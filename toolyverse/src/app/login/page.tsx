import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/AuthForm';
import { getViewer } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Log in', robots: { index: false }, alternates: { canonical: '/login' } };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams;
  if (await getViewer()) redirect(typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/account');
  return (
    <div className="mx-auto max-w-[420px] px-4 pt-14">
      <p className="label">Welcome back</p>
      <h1 className="display mt-2 text-[2.4rem]">Log in</h1>
      <div className="mt-6 border border-ink bg-card p-6">
        <AuthForm kind="login" next={typeof next === 'string' ? next : undefined} />
      </div>
    </div>
  );
}
