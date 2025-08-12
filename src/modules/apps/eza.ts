import { createAppModule, createCrossPlatformPackages } from '../../core/app-module-factory.js';

export const ezaModule = createAppModule({
  id: 'apps:eza',
  description: 'Eza - modern replacement for ls with colors and git integration',
  priority: 55,
  packageName: 'eza',
  packageMappings: createCrossPlatformPackages('eza'),
  customStatus: async (ctx) => {
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      
      await execAsync('which eza');
      return { status: 'applied', message: 'Eza available' };
    } catch {
      return { status: 'stale', message: 'Eza not found in PATH' };
    }
  },
  getDetails: (_ctx) => [
    'Modern ls replacement:',
    '  • Colorized output with file type indicators',
    '  • Git integration showing file status',
    '  • Tree view and grid layout options',
    '  • Better defaults and human-readable sizes',
  ],
});
