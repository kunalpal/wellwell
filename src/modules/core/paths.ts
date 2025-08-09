import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from '../../core/types.js';
import {
  addPathContribution,
  listPathContributions,
  readResolvedPaths,
  resolvePaths,
  writeResolvedPaths,
} from '../../core/contrib.js';

export const commonPaths = (ctx: ConfigurationContext): string[] => {
  const base = [`${ctx.homeDir}/bin`];
  if (ctx.platform === 'macos') {
    base.push('/opt/homebrew/bin');
  }
  return base;
};

export const pathsModule: ConfigurationModule = {
  id: 'core:paths',
  description: 'Collect PATH contributions and compute final order',
  priority: 20,

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    // register common paths if not present
    const commons = commonPaths(ctx);
    let added = 0;
    for (const p of commons) {
      added += addPathContribution(ctx, { path: p, prepend: true }) ? 1 : 0;
    }
    const current = listPathContributions(ctx);
    const resolved = resolvePaths(ctx);
    const prev = readResolvedPaths(ctx) ?? [];
    const changed = JSON.stringify(prev) !== JSON.stringify(resolved);
    const changes = [] as { summary: string }[];
    if (added > 0) changes.push({ summary: `Register ${added} common PATH entries` });
    if (changed) changes.push({ summary: 'Recompute PATH order' });
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      const resolved = resolvePaths(ctx);
      writeResolvedPaths(ctx, resolved);
      return { success: true, changed: true, message: 'Paths resolved' };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const resolved = readResolvedPaths(ctx) ?? [];
    return { status: resolved.length > 0 ? 'applied' : 'idle' };
  },
};


