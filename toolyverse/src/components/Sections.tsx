import Link from 'next/link';
import { Fragment } from 'react';
import type { Section } from '@/lib/tools/registry';

/** Text with [label](/path) links turned into internal links. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
        return m ? (
          <Link key={i} href={m[2]}>
            {m[1]}
          </Link>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        );
      })}
    </>
  );
}

/** Long-form help blocks of a tool page. */
export function Sections({ sections }: { sections: Section[] }) {
  return (
    <>
      {sections.map((s) => (
        <section key={s.h2}>
          <h2>{s.h2}</h2>
          {s.body?.map((p) => (
            <p key={p.slice(0, 40)}>
              <Rich text={p} />
            </p>
          ))}
          {s.list && (
            <ul className="mb-4 max-w-[68ch] space-y-2.5">
              {s.list.map((item) => {
                const at = item.indexOf(': ');
                const label = at > 0 && at < 40 ? item.slice(0, at) : null;
                return (
                  <li key={item.slice(0, 40)} className="grid grid-cols-[1rem_1fr] gap-2 text-ink-2">
                    <span className="mt-[0.6rem] h-1.5 w-1.5 bg-signal" aria-hidden="true" />
                    <span>
                      {label && <b className="font-semibold text-ink">{label}: </b>}
                      <Rich text={label ? item.slice(at + 2) : item} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {s.table && (
            <div className="mb-4 overflow-x-auto border-t border-ink">
              <table className="w-full min-w-[640px] border-collapse text-[0.92rem]">
                <thead>
                  <tr className="border-b border-ink text-left">
                    {s.table.head.map((h, i) => (
                      <th key={i} className={`label py-2 pr-3 font-normal ${i === 1 ? '!text-ink' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((r, ri) => (
                    <tr key={`${ri}-${r[0]}`} className="border-b border-rule align-top">
                      {r.map((c, i) => (
                        <td key={i} className={`py-2 pr-3 ${i === 0 ? 'font-medium' : i === 1 ? 'font-semibold' : 'text-ink-2'}`}>
                          <Rich text={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {s.images && (
            <div className="mb-4 grid max-w-[68rem] grid-cols-2 gap-4 lg:grid-cols-4">
              {s.images.map((im) => (
                <figure key={im.src} className="m-0">
                  {/* Plain images: small, already sized, and their own address is what image search lists. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.src} alt={im.alt} width={im.width} height={im.height} loading="lazy" decoding="async" className="h-auto w-full border border-rule bg-white" />
                  {im.caption && <figcaption className="mt-1.5 text-[0.85rem] text-ink-2">{im.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
}
