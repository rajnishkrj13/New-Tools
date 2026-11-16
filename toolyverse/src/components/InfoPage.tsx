import type { ReactNode } from 'react';

export function InfoPage({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[760px] px-4 pt-12 sm:px-6">
      <p className="label">{label}</p>
      <h1 className="display mt-2 text-[2.8rem]">{title}</h1>
      <div className="prose-tv mt-4">{children}</div>
    </div>
  );
}
