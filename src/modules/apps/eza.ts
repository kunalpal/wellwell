import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
  PlanChange,
} from '../../core/types.js';
import { addPackageContribution } from '../../core/contrib.js';

export const ezaModule: ConfigurationModule = {
  id: 'apps:eza',
  description: 'Eza - modern replacement for ls with colors and git integration',
  priority: 55,

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    const changes: PlanChange[] = [];
    
    // Add platform-specific package contributions
    addPackageContribution(ctx, {
      name: 'eza',
      manager: 'homebrew',
      platforms: ['macos'],
    });
    
    addPackageContribution(ctx, {
      name: 'eza',
      manager: 'apt',
      platforms: ['ubuntu'],
    });
    
    addPackageContribution(ctx, {
      name: 'eza',
      manager: 'yum',
      platforms: ['al2'],
    });
    
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    // Package installation is handled by package manager modules
    return { success: true, changed: false, message: 'Package requirements contributed' };
  },

  async status(_ctx): Promise<StatusResult> {
    // Check if eza is available in PATH
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      
      await execAsync('which eza');
      return { status: 'applied', message: 'Eza available' };
    } catch {
      return { status: 'idle', message: 'Eza not found in PATH' };
    }
  },

  getDetails(_ctx): string[] {
    return [
      'Modern ls replacement:',
      '  • Colorized output with file type indicators',
      '  • Git integration showing file status',
      '  • Tree view and grid layout options',
      '  • Better defaults and human-readable sizes',
    ];
  },
};
