import { getSiteSetting } from '@/lib/site';
import { requireArea } from '@/lib/auth/session';
import { saveSite } from '../actions';

export default async function AdminSite() {
  await requireArea('site');
  const [signupsOpen, announcement] = await Promise.all([getSiteSetting('signupsOpen'), getSiteSetting('announcement')]);
  return (
    <div>
      <h1 className="display text-[2.4rem]">Site settings</h1>
      <form action={saveSite} className="mt-6 max-w-xl space-y-5 border border-ink bg-card p-5">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="signupsOpen" defaultChecked={signupsOpen} /> Allow new sign-ups
        </label>
        <label className="block">
          <span className="label mb-1 block">Announcement bar (leave empty to hide)</span>
          <input name="announcement" defaultValue={announcement} maxLength={200} className="field" placeholder="e.g. New: GST invoice maker" />
        </label>
        <button className="btn" type="submit">
          Save
        </button>
      </form>
    </div>
  );
}
