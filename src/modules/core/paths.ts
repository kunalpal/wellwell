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
  type PathContribution,
} from '../../core/contrib.js';

export const commonPaths = (ctx: ConfigurationContext): PathContribution[] => {
  const contribs: PathContribution[] = [
    { path: `${ctx.homeDir}/bin`, prepend: true },
    { path: `${ctx.homeDir}/.local/bin`, prepend: true },
    { path: `${ctx.homeDir}/.cargo/bin`, prepend: false },
    { path: `${ctx.homeDir}/go/bin`, prepend: false },
    { path: `${ctx.homeDir}/.bun/bin`, prepend: false },
    { path: '/usr/local/bin', prepend: true, platforms: ['macos', 'ubuntu', 'al2'] },
    { path: '/opt/homebrew/bin', prepend: true, platforms: ['macos'] },
    { path: '/opt/homebrew/sbin', prepend: false, platforms: ['macos'] },
    { path: '/snap/bin', prepend: false, platforms: ['ubuntu'] },
  ];
  return contribs;
};

export const pathsModule: ConfigurationModule = {
  id: 'core:paths',
  description: 'Collect PATH contributions and compute final order',

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    // register common paths if not present
    const commons = commonPaths(ctx);
    let added = 0;
    for (const c of commons) {
      added += addPathContribution(ctx, c) ? 1 : 0;
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
    return { status: resolved.length > 0 ? 'applied' : 'stale' };
  },

  getDetails(ctx): string[] {
    const resolvedPaths = readResolvedPaths(ctx);
    if (resolvedPaths && resolvedPaths.length > 0) {
      const details = [`Managing ${resolvedPaths.length} paths:`];
      resolvedPaths.forEach(pathStr => {
        details.push(`  • ${pathStr}`);
      });
      return details;
    } else {
      return ['No paths configured'];
    }
  },
};
