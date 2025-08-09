import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from '../../core/types.js';
import {
  addAliasContribution,
  listAliasContributions,
  readResolvedAliases,
  resolveAliases,
  writeResolvedAliases,
} from '../../core/contrib.js';

export const commonAliases = (_ctx: ConfigurationContext) => [
  { name: 'll', value: 'ls -alF' },
  { name: 'la', value: 'ls -A' },
  { name: 'l', value: 'ls -CF' },
];

export const aliasesModule: ConfigurationModule = {
  id: 'core:aliases',
  description: 'Collect alias contributions and compute final set',
  priority: 25,

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    const commons = commonAliases(ctx);
    let added = 0;
    for (const a of commons) {
      added += addAliasContribution(ctx, a) ? 1 : 0;
    }
    const current = listAliasContributions(ctx);
    const resolved = resolveAliases(ctx);
    const prev = readResolvedAliases(ctx) ?? [];
    const changed = JSON.stringify(prev) !== JSON.stringify(resolved);
    const changes = [] as { summary: string }[];
    if (added > 0) changes.push({ summary: `Register ${added} common aliases` });
    if (changed) changes.push({ summary: 'Recompute aliases' });
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      const resolved = resolveAliases(ctx);
      writeResolvedAliases(ctx, resolved);
      return { success: true, changed: true, message: 'Aliases resolved' };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const resolved = readResolvedAliases(ctx) ?? [];
    return { status: resolved.length > 0 ? 'applied' : 'idle' };
  },
};


