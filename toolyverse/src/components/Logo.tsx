/** The Toolyverse mark: a catalogue tab with a notch, and the wordmark set in condensed type. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="5" width="30" height="25" rx="1.5" fill="var(--ink)" />
      <path d="M4 5V3.5A1.5 1.5 0 0 1 5.5 2h9A1.5 1.5 0 0 1 16 3.5V5" fill="var(--signal)" />
      <path d="M9 11.5h14M16 11.5V25" stroke="var(--paper)" strokeWidth="3.2" strokeLinecap="square" />
      <circle cx="24.5" cy="23.5" r="2" fill="var(--signal)" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="display text-[1.45rem] font-bold tracking-tight">
        Tooly<span className="text-signal">verse</span>
      </span>
    </span>
  );
}
