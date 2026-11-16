/**
 * Running inside Toolyverse (?embed=1). The site's admin decides which features are on and
 * how big a file may be; the editor reads that from the site before it starts. Opened on its
 * own, the editor has every feature and no size limit.
 */

export const EMBEDDED = typeof location !== 'undefined' && new URLSearchParams(location.search).has('embed');

export interface EmbedConfig {
  features: Record<string, boolean>;
  maxMb: number | null;
  memberMaxMb: number | null;
  signedIn: boolean;
}

let config: EmbedConfig | null = null;

export async function loadEmbedConfig(): Promise<void> {
  if (!EMBEDDED) return;
  try {
    const res = await fetch('/api/tools/pdf-editor/config', { credentials: 'same-origin', cache: 'no-store' });
    if (res.ok) config = (await res.json()) as EmbedConfig;
  } catch {
    /* site unreachable: run with everything on */
  }
}

export const embedConfig = () => config;

/** Whether a feature is switched on (always true outside Toolyverse). */
export const feature = (key: 'editText' | 'sign' | 'forms' | 'ocr' | 'redact' | 'protect' | 'combine' | 'export' | 'print') => config?.features?.[key] !== false;

/** Why a file is too big for this visitor, or null. */
export function sizeLimitProblem(name: string, size: number): string | null {
  const max = config?.maxMb;
  if (!max || size <= max * 1048576) return null;
  const mb = (size / 1048576).toFixed(1);
  const more = !config?.signedIn && config?.memberMaxMb && config.memberMaxMb > max ? ` With a free Toolyverse account the limit is ${config.memberMaxMb} MB.` : '';
  return `"${name}" is ${mb} MB; the limit here is ${max} MB.${more}`;
}

/** The tool a Toolyverse landing page asks for ("sign", "ocr"…), opened once the first file is loaded. */
export const FOCUS = EMBEDDED ? new URLSearchParams(location.search).get('focus') : null;

/** Saved signatures and details follow a signed-in member to other devices. */
export const syncsToAccount = () => EMBEDDED && !!config?.signedIn;
