import type { CategoryId } from '@/lib/tools/registry';

/** Drawn glyphs for the four drawers, so the catalogue does not rely on stock icon sets. */
export function CategoryGlyph({ id, size = 40 }: { id: CategoryId; size?: number }) {
  const c = `var(--${id === 'convert' ? 'convert' : id})`;
  const common = { width: size, height: size, viewBox: '0 0 40 40', 'aria-hidden': true } as const;
  if (id === 'pdf')
    return (
      <svg {...common}>
        <path d="M9 4h15l8 8v24H9z" fill="var(--card)" stroke="var(--ink)" strokeWidth="1.6" />
        <path d="M24 4v8h8" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
        <path d="M13 19h14M13 23h14M13 27h9" stroke="var(--ink-3)" strokeWidth="1.6" />
        <rect x="5" y="29" width="17" height="8" fill={c} />
        <text x="13.5" y="35.4" textAnchor="middle" fontSize="6.4" fontFamily="var(--font-mono)" fontWeight="700" fill="#fff">PDF</text>
      </svg>
    );
  if (id === 'image')
    return (
      <svg {...common}>
        <rect x="5" y="8" width="30" height="24" fill="var(--card)" stroke="var(--ink)" strokeWidth="1.6" />
        <path d="M5 28l9-9 7 7 4-4 10 10" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" />
        <circle cx="26" cy="15" r="3" fill={c} />
      </svg>
    );
  if (id === 'gst')
    return (
      <svg {...common}>
        <path d="M8 4h24v32l-4-3-4 3-4-3-4 3-4-3-4 3z" fill="var(--card)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M13 12h14M13 17h9" stroke="var(--ink-3)" strokeWidth="1.6" />
        <text x="20" y="28.5" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fontWeight="700" fill={c}>₹%</text>
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="4" y="13" width="32" height="14" fill="var(--card)" stroke="var(--ink)" strokeWidth="1.6" />
      {[9, 14, 19, 24, 29].map((x, i) => (
        <path key={x} d={`M${x} 13v${i % 2 ? 4 : 7}`} stroke="var(--ink)" strokeWidth="1.4" />
      ))}
      <path d="M12 7h16m-4-3 4 3-4 3M28 33H12m4-3-4 3 4 3" fill="none" stroke={c} strokeWidth="1.8" />
    </svg>
  );
}
