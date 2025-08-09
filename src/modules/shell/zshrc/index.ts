import type { ConfigurationModule } from '../../../core/types.js';
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
};

export const zshrcModules: ConfigurationModule[] = [
  zshrcBaseModule,
  zshrcPluginsModule,
  zshrcCompositeModule,
];


