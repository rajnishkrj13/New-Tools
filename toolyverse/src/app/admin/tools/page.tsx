import Link from 'next/link';
import { CATEGORIES, toolNo, toolPath, toolsIn } from '@/lib/tools/registry';
import { allToolStates } from '@/lib/tools/settings';
import { requireArea } from '@/lib/auth/session';
import { resetTool, saveTool } from '../actions';

export default async function AdminTools() {
  await requireArea('tools');
  const states = await allToolStates();
  return (
    <div>
      <h1 className="display text-[2.4rem]">Tools &amp; features</h1>
      <p className="mt-2 max-w-[70ch] text-ink-2">
        <b>Off</b> removes a tool from the site, menus and sitemap (its page returns “not found”). <b>Members</b> keeps the page visible to search engines but asks
        visitors to sign in before using it. Feature switches remove parts of a tool for everyone.
      </p>
      {CATEGORIES.map((c) => (
        <section key={c.id} className="mt-10">
          <h2 className="label">{c.name}</h2>
          <div className="mt-3 space-y-3">
            {toolsIn(c.id).map((t) => {
              const s = states.get(t.slug)!;
              return (
                <form key={t.slug} action={saveTool} className={`border bg-card p-4 ${s.enabled ? 'border-ink' : 'border-rule-2 opacity-80'}`}>
                  <input type="hidden" name="slug" value={t.slug} />
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="min-w-[12rem] flex-1">
                      <p className="label">№{toolNo(t)}</p>
                      <Link href={toolPath(t)} className="display text-[1.25rem] hover:text-signal">
                        {t.name}
                      </Link>
                    </div>
                    <label className="flex items-center gap-2 text-[0.93rem]">
                      <input type="checkbox" name="enabled" defaultChecked={s.enabled} /> On
                    </label>
                    <label className="flex items-center gap-2 text-[0.93rem]">
                      Who can use it
                      <select name="access" defaultValue={s.access} className="field !min-h-9 !w-auto !py-1">
                        <option value="public">Everyone</option>
                        <option value="members">Members only</option>
                      </select>
                    </label>
                    {s.limits && (
                      <>
                        <label className="flex items-center gap-2 text-[0.93rem]">
                          Visitors
                          <input name="publicMb" type="number" min={1} max={2000} defaultValue={s.limits.publicMb} className="field !min-h-9 !w-20 !py-1" /> MB
                        </label>
                        <label className="flex items-center gap-2 text-[0.93rem]">
                          Members
                          <input name="memberMb" type="number" min={1} max={2000} defaultValue={s.limits.memberMb} className="field !min-h-9 !w-20 !py-1" /> MB
                        </label>
                      </>
                    )}
                  </div>
                  {t.features?.length ? (
                    <fieldset className="mt-4 border-t border-rule pt-3">
                      <legend className="label">Features</legend>
                      <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                        {t.features.map((f) => (
                          <label key={f.key} className="flex items-start gap-2 text-[0.92rem]" title={f.hint}>
                            <input type="checkbox" name={`f:${f.key}`} defaultChecked={s.features[f.key]} className="mt-1" />
                            <span>
                              {f.label}
                              <span className="block text-[0.78rem] text-ink-3">{f.hint}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  <div className="mt-4 flex gap-2">
                    <button type="submit" className="btn !min-h-9 text-sm">
                      Save
                    </button>
                    <button type="submit" formAction={resetTool} className="btn btn-ghost !min-h-9 text-sm">
                      Reset to defaults
                    </button>
                  </div>
                </form>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
