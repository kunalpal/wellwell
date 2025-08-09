import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from '../../../core/types.js';

// A simple module that only reports status/progress without file writes (placeholder for plugin mgmt)
export const zshrcPluginsModule: ConfigurationModule = {
  id: 'shell:zshrc:plugins',
  description: 'Configure zsh plugins (placeholder)',
  dependsOn: ['shell:zshrc:base'],
  priority: 60,

  async isApplicable(_ctx) {
    return true;
  },
  async plan(_ctx): Promise<PlanResult> {
    return { changes: [{ summary: 'No-op plugin configuration (scaffold)' }] };
  },
  async apply(_ctx): Promise<ApplyResult> {
    return { success: true, changed: false, message: 'No-op' };
  },
  async status(_ctx): Promise<StatusResult> {
    return { status: 'applied', message: 'placeholder' };
  },
};


