import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getViewer } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { TOOLS, toolPath } from '@/lib/tools/registry';
import { allToolStates } from '@/lib/tools/settings';
import { logout } from '@/lib/auth/actions';
import { deleteMyData, changePassword } from './actions';
import { PasswordForm } from './PasswordForm';

export const metadata: Metadata = { title: 'Your account', robots: { index: false } };

const LABELS: Record<string, string> = {
  'gst-invoice-business': 'GST invoice: your business details',
  'gstr2b-state-names': 'GSTR-2B merger: state names for your GSTINs',
  'pdf-profile-details': 'PDF editor: your saved details',
  'pdf-profile-marks': 'PDF editor: saved signatures and initials',
  'pdf-profile-dateFormat': 'PDF editor: date format',
};

export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/account');
  const d = await db();
  const [saved, states] = await Promise.all([
    d.select({ key: schema.userData.key, updatedAt: schema.userData.updatedAt }).from(schema.userData).where(eq(schema.userData.userId, viewer.id)),
    allToolStates(),
  ]);
  const membersTools = TOOLS.filter((t) => states.get(t.slug)?.enabled && states.get(t.slug)?.access === 'members');
  const limits = TOOLS.filter((t) => t.limits && states.get(t.slug)?.enabled)
    .map((t) => states.get(t.slug)!.limits!)
    .reduce((m, l) => Math.max(m, l.memberMb), 0);

  return (
    <div className="mx-auto max-w-[920px] px-4 pt-12 sm:px-6">
      <p className="label">{viewer.role === 'admin' ? 'Administrator' : 'Member'}</p>
      <h1 className="display mt-2 text-[2.6rem]">Hello, {viewer.name.split(' ')[0]}</h1>
      <p className="mt-1 text-ink-2">{viewer.email}</p>

      <div className="mt-10 grid gap-10 md:grid-cols-2">
        <section>
          <h2 className="label">What your account gives you</h2>
          <ul className="mt-3 border-t border-ink">
            <li className="border-b border-rule py-3">File limits up to {limits} MB on PDF and image tools.</li>
            <li className="border-b border-rule py-3">
              {membersTools.length ? (
                <>
                  Members-only tools:{' '}
                  {membersTools.map((t, i) => (
                    <span key={t.slug}>
                      {i ? ', ' : ''}
                      <Link className="underline underline-offset-2" href={toolPath(t)}>
                        {t.name}
                      </Link>
                    </span>
                  ))}
                </>
              ) : (
                'All tools are open to everyone right now.'
              )}
            </li>
            <li className="border-b border-rule py-3">Saved items below follow you to every device you log in on.</li>
          </ul>
        </section>

        <section>
          <h2 className="label">Saved on your account</h2>
          {saved.length ? (
            <ul className="mt-3 border-t border-ink">
              {saved.map((s) => (
                <li key={s.key} className="flex justify-between gap-4 border-b border-rule py-3 text-[0.94rem]">
                  <span>{LABELS[s.key] ?? s.key}</span>
                  <span className="font-mono text-ink-3">{s.updatedAt.toLocaleDateString('en-IN')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-ink-3">Nothing yet. Signatures you save in the PDF editor and your GST invoice details appear here.</p>
          )}
          {saved.length > 0 && (
            <form action={deleteMyData} className="mt-3">
              <button className="btn btn-ghost !min-h-9 text-sm" type="submit">
                Delete everything saved
              </button>
            </form>
          )}
        </section>

        <section>
          <h2 className="label">Change password</h2>
          <PasswordForm action={changePassword} />
        </section>

        <section>
          <h2 className="label">Sign out</h2>
          <form action={logout} className="mt-3">
            <button className="btn btn-ghost" type="submit">
              Log out on this device
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
