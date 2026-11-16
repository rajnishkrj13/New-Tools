import 'server-only';
import { db, schema } from '@/lib/db';
import type { Viewer } from '@/lib/auth/session';
import { TOOLS, toolBySlug, type Tool } from './registry';

/** What the admin decided for a tool, merged with the tool's defaults. */
export interface ToolState {
  slug: string;
  enabled: boolean;
  access: 'public' | 'members';
  features: Record<string, boolean>;
  limits: { publicMb: number; memberMb: number } | null;
}

export function defaultState(t: Tool): ToolState {
  return {
    slug: t.slug,
    enabled: true,
    access: 'public',
    features: Object.fromEntries((t.features ?? []).map((f) => [f.key, f.default])),
    limits: t.limits ?? null,
  };
}

// Read on almost every page, changed only by the admin: kept in memory for a short while.
// Pages and API routes are bundled separately, so the cache lives on globalThis: an admin
// change clears it for both at once. (With several server processes, others catch up within TTL.)
const g = globalThis as unknown as { __tvToolCache?: { at: number; map: Map<string, ToolState> } | null };
const TTL = 30_000;

export async function allToolStates(): Promise<Map<string, ToolState>> {
  const cache = g.__tvToolCache;
  if (cache && Date.now() - cache.at < TTL) return cache.map;
  const rows = await (await db()).select().from(schema.toolSettings);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const map = new Map<string, ToolState>();
  for (const t of TOOLS) {
    const base = defaultState(t);
    const r = bySlug.get(t.slug);
    if (!r) {
      map.set(t.slug, base);
      continue;
    }
    map.set(t.slug, {
      slug: t.slug,
      enabled: r.enabled,
      access: r.access,
      // Only features the tool still has; new features start at their default.
      features: Object.fromEntries(Object.entries(base.features).map(([k, v]) => [k, r.features?.[k] ?? v])),
      limits: base.limits && { publicMb: r.publicMaxMb ?? base.limits.publicMb, memberMb: r.memberMaxMb ?? base.limits.memberMb },
    });
  }
  g.__tvToolCache = { at: Date.now(), map };
  return map;
}

export async function toolState(slug: string): Promise<ToolState | null> {
  if (!toolBySlug.has(slug)) return null;
  return (await allToolStates()).get(slug)!;
}

export function forgetToolStates() {
  g.__tvToolCache = null;
}

export async function saveToolState(s: ToolState) {
  const d = await db();
  const values = {
    slug: s.slug,
    enabled: s.enabled,
    access: s.access,
    features: s.features,
    publicMaxMb: s.limits?.publicMb ?? null,
    memberMaxMb: s.limits?.memberMb ?? null,
    updatedAt: new Date(),
  };
  await d.insert(schema.toolSettings).values(values).onConflictDoUpdate({ target: schema.toolSettings.slug, set: values });
  forgetToolStates();
}

/** What this viewer may do with the tool. */
export function accessFor(state: ToolState, viewer: Viewer) {
  const member = !!viewer;
  return {
    usable: state.enabled && (state.access === 'public' || member),
    needsLogin: state.enabled && state.access === 'members' && !member,
    maxMb: state.limits ? (member ? state.limits.memberMb : state.limits.publicMb) : null,
    memberMaxMb: state.limits?.memberMb ?? null,
  };
}
