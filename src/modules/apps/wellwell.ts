import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
  PlanChange,
} from '../../core/types.js';
import { addPathContribution } from '../../core/contrib.js';

const execAsync = promisify(exec);

async function getWellwellProjectRoot(): Promise<string | null> {
  try {
    // Try to find the wellwell project by looking for package.json with our name
    const { stdout } = await execAsync('pwd');
    let currentDir = stdout.trim();
    
    // Walk up the directory tree looking for wellwell project
    while (currentDir !== '/') {
      try {
        const packageJsonPath = path.join(currentDir, 'package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        if (packageJson.name === 'wellwell') {
          return currentDir;
        }
      } catch {
        // Continue searching
      }
      currentDir = path.dirname(currentDir);
    }
    return null;
  } catch {
    return null;
  }
}

async function isWwCommandAvailable(): Promise<boolean> {
  try {
    await execAsync('which ww');
    return true;
  } catch {
    return false;
  }
}

async function createWwScript(projectRoot: string, binDir: string): Promise<void> {
  const wwScript = path.join(binDir, 'ww');
  const wellwellExecutable = path.join(projectRoot, 'dist', 'cli', 'index.js');
  
  // Create a shell script that runs the wellwell executable
  const scriptContent = `#!/bin/bash
# Auto-generated wellwell wrapper script
exec node "${wellwellExecutable}" "$@"
`;
  
  await fs.writeFile(wwScript, scriptContent, { mode: 0o755 });
}

export const wellwellModule: ConfigurationModule = {
  id: 'apps:wellwell',
  description: 'Wellwell self-management - provides "ww" command',
  dependsOn: ['common:homebin'], // Ensure ~/bin exists
  priority: 70,

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    const changes: PlanChange[] = [];
    
    // Add ~/bin to PATH
    addPathContribution(ctx, {
      path: path.join(ctx.homeDir, 'bin'),
      prepend: true,
    });
    
    const projectRoot = await getWellwellProjectRoot();
    if (!projectRoot) {
      changes.push({ summary: 'Cannot find wellwell project root - ww command unavailable' });
      return { changes };
    }
    
    const isWwAvailable = await isWwCommandAvailable();
    if (!isWwAvailable) {
      changes.push({ summary: 'Create "ww" command script in ~/bin' });
    }
    
    // Check if the built executable exists
    const builtExecutable = path.join(projectRoot, 'dist', 'cli', 'index.js');
    try {
      await fs.access(builtExecutable);
    } catch {
      changes.push({ summary: 'Wellwell executable not built - run "npm run build" first' });
    }
    
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      const projectRoot = await getWellwellProjectRoot();
      if (!projectRoot) {
        return { 
          success: false, 
          error: new Error('Cannot find wellwell project root'), 
          message: 'Project root not found' 
        };
      }
      
      // Check if the built executable exists
      const builtExecutable = path.join(projectRoot, 'dist', 'cli', 'index.js');
      try {
        await fs.access(builtExecutable);
      } catch {
        return { 
          success: false, 
          error: new Error('Wellwell executable not built'), 
          message: 'Run "npm run build" first' 
        };
      }
      
      const binDir = path.join(ctx.homeDir, 'bin');
      const isWwAvailable = await isWwCommandAvailable();
      
      if (!isWwAvailable) {
        // Ensure ~/bin directory exists (should be handled by homebin module)
        await fs.mkdir(binDir, { recursive: true });
        
        // Create the ww script
        await createWwScript(projectRoot, binDir);
        
        return { 
          success: true, 
          changed: true, 
          message: 'Created "ww" command script' 
        };
      }
      
      return { 
        success: true, 
        changed: false, 
        message: '"ww" command already available' 
      };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(_ctx): Promise<StatusResult> {
    const projectRoot = await getWellwellProjectRoot();
    if (!projectRoot) {
      return { status: 'idle', message: 'Project root not found' };
    }
    
    // Check if the built executable exists
    const builtExecutable = path.join(projectRoot, 'dist', 'cli', 'index.js');
    try {
      await fs.access(builtExecutable);
    } catch {
      return { status: 'idle', message: 'Wellwell not built' };
    }
    
    const isWwAvailable = await isWwCommandAvailable();
    if (isWwAvailable) {
      return { status: 'applied', message: '"ww" command available' };
    } else {
      return { status: 'idle', message: '"ww" command not found' };
    }
  },

  getDetails(_ctx): string[] {
    return [
      'Self-management:',
      '  • Creates "ww" command in ~/bin',
      '  • Adds ~/bin to PATH',
      '  • Enables global wellwell access',
    ];
  },
};
