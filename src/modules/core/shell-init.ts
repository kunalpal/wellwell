import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from '../../core/types.js';
import {
  readResolvedShellInit,
  resolveShellInit,
  writeResolvedShellInit,
} from '../../core/contrib.js';

export const shellInitModule: ConfigurationModule = {
  id: 'core:shell-init',
  description: 'Collect shell initialization contributions and compute final order',
  priority: 40, // Run after contribution modules

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    const resolved = resolveShellInit(ctx);
    const prev = readResolvedShellInit(ctx) ?? [];
    const changed = JSON.stringify(prev) !== JSON.stringify(resolved);
    const changes = [];
    if (changed) changes.push({ summary: 'Recompute shell initialization' });
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      const resolved = resolveShellInit(ctx);
      writeResolvedShellInit(ctx, resolved);
      return { success: true, changed: true, message: 'Shell init resolved' };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const resolved = readResolvedShellInit(ctx) ?? [];
    return { status: resolved.length > 0 ? 'applied' : 'idle' };
  },
};
