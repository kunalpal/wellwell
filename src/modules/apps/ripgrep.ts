import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
  PlanChange,
} from '../../core/types.js';
import { addPackageContribution } from '../../core/contrib.js';

export const ripgrepModule: ConfigurationModule = {
  id: 'apps:ripgrep',
  description: 'Ripgrep - fast text search tool',
  priority: 60,

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    const changes: PlanChange[] = [];
    
    // Add platform-specific package contributions
    addPackageContribution(ctx, {
      name: 'ripgrep',
      manager: 'homebrew',
      platforms: ['macos'],
    });
    
    addPackageContribution(ctx, {
      name: 'ripgrep',
      manager: 'apt',
      platforms: ['ubuntu'],
    });
    
    addPackageContribution(ctx, {
      name: 'ripgrep',
      manager: 'yum',
      platforms: ['al2'],
    });
    
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    // Package installation is handled by package manager modules
    // This module just contributes the package requirements
    return { success: true, changed: false, message: 'Package requirements contributed' };
  },

  async status(_ctx): Promise<StatusResult> {
    // Check if ripgrep is available in PATH
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      
      await execAsync('which rg');
      return { status: 'applied', message: 'Ripgrep available' };
    } catch {
      return { status: 'stale', message: 'Ripgrep not found in PATH' };
    }
  },
};
