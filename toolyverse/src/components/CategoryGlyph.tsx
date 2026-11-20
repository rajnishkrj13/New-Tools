import type { CategoryId } from '@/lib/tools/registry';

/** Drawn glyphs for the drawers, so the catalogue does not rely on stock icon sets. */
export function CategoryGlyph({ id, size = 40 }: { id: CategoryId; size?: number }) {
  const c = `var(--${id})`;
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
  if (id === 'qr')
    return (
      <svg {...common}>
        <rect x="5" y="5" width="30" height="30" fill="var(--card)" stroke="var(--ink)" strokeWidth="1.6" />
        {[
          [8, 8],
          [25, 8],
          [8, 25],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <rect x={x + 0.8} y={y + 0.8} width="5.4" height="5.4" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
            <rect x={x + 2.5} y={y + 2.5} width="2" height="2" fill="var(--ink)" />
          </g>
        ))}
        <path d="M17 9h2v4h-2zM17 17h4v2h-4zM9 18h4v2H9zM17 22h2v2h-2zM24 18h2v4h-2zM21 25h4v2h-4zM28 25h2v5h-2zM17 28h4v2h-4z" fill={c} />
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
  if (id === 'tally')
    return (
      <svg {...common}>
        <rect x="6" y="5" width="28" height="31" fill="var(--card)" stroke="var(--ink)" strokeWidth="1.6" />
        <path d="M6 12h28M20 12v24" stroke="var(--ink)" strokeWidth="1.4" />
        <text x="13" y="10.6" textAnchor="middle" fontSize="5.2" fontFamily="var(--font-mono)" fontWeight="700" fill={c}>Dr</text>
        <text x="27" y="10.6" textAnchor="middle" fontSize="5.2" fontFamily="var(--font-mono)" fontWeight="700" fill={c}>Cr</text>
        <path d="M9 17h8M9 22h6M23 17h8M23 22h6M23 27h8" stroke="var(--ink-3)" strokeWidth="1.5" />
        <path d="M9 31h8M23 31h8" stroke={c} strokeWidth="2" />
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
