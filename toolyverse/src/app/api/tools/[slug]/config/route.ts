import { getViewer } from '@/lib/auth/session';
import { accessFor, toolState } from '@/lib/tools/settings';

/** A tool's switches for this viewer. The embedded PDF editor reads this when it starts. */
export async function GET(_: Request, ctx: RouteContext<'/api/tools/[slug]/config'>) {
  const { slug } = await ctx.params;
  const [state, viewer] = await Promise.all([toolState(slug), getViewer()]);
  if (!state) return Response.json({ error: 'Unknown tool' }, { status: 404 });
  const access = accessFor(state, viewer);
  return Response.json(
    {
      enabled: state.enabled,
      usable: access.usable,
      needsLogin: access.needsLogin,
      features: state.features,
      maxMb: access.maxMb,
      memberMaxMb: access.memberMaxMb,
      signedIn: !!viewer,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
