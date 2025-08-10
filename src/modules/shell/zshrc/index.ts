import type { ConfigurationModule, StatusResult } from '../../../core/types.js';
import { zshrcBaseModule } from './base.js';
import { zshrcPluginsModule } from './plugins.js';

// Composite module to orchestrate submodules via dependencies
export const zshrcCompositeModule: ConfigurationModule = {
  id: 'shell:zshrc',
  description: 'Composite zshrc configuration',
  dependsOn: [zshrcBaseModule.id, zshrcPluginsModule.id],
  priority: 100,
  async isApplicable(ctx) {
    return ctx.platform !== 'unknown';
  },
  async plan(ctx) {
    return { changes: [] };
  },
  async apply(_ctx) {
    return { success: true, changed: false, message: 'Composite only' };
  },
  async status(ctx): Promise<StatusResult> {
    // Check status of all dependencies
    const baseStatus = await zshrcBaseModule.status?.(ctx) ?? { status: 'stale' as const };
    const pluginsStatus = await zshrcPluginsModule.status?.(ctx) ?? { status: 'stale' as const };
    
    if (baseStatus.status === 'applied' && pluginsStatus.status === 'applied') {
      return { status: 'applied', message: 'All components configured' };
    } else if (baseStatus.status === 'failed' || pluginsStatus.status === 'failed') {
      return { status: 'failed', message: 'One or more components failed' };
    } else {
      return { status: 'stale', message: 'Components not ready' };
    }
  },

  getDetails(_ctx): string[] {
    return [
      'Composite zsh configuration:',
      '  • Orchestrates base + plugins',
      '  • Manages overall shell setup',
    ];
  },
};

export const zshrcModules: ConfigurationModule[] = [
  zshrcBaseModule,
  zshrcPluginsModule,
  zshrcCompositeModule,
];


