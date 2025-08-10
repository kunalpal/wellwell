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
    // Try to find wellwell project by searching from the executable location
    const executablePath = process.argv[1]; // Path to the wellwell executable
    const possiblePaths = [
      process.cwd(), // Current working directory
      path.dirname(executablePath), // Directory containing the executable
      path.resolve(path.dirname(executablePath), '../../'), // Go up from dist/cli to project root
      path.resolve(process.env.HOME || '', 'Projects/wellwell'),
      path.resolve(process.env.HOME || '', 'workspace/wellwell'),
      path.resolve(process.env.HOME || '', 'dev/wellwell'),
    ];
    
    for (const basePath of possiblePaths) {
      let currentDir = basePath;
      
      // Walk up the directory tree looking for wellwell project
      while (currentDir !== '/' && currentDir.length > 0) {
        try {
          const packageJsonPath = path.join(currentDir, 'package.json');
          const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
          if (packageJson.name === 'wellwell') {
            return currentDir;
          }
        } catch {
          // Continue searching
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break; // Prevent infinite loop
        currentDir = parentDir;
      }
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
  const wellwellExecutable = path.join(projectRoot, 'dist', 'src', 'cli', 'index.js');
  
  // Create a shell script that runs the wellwell executable
  const scriptContent = `#!/bin/bash
# Auto-generated wellwell wrapper script
exec node "${wellwellExecutable}" "$@"
`;
  
  await fs.writeFile(wwScript, scriptContent, { mode: 0o755 });
}

async function rebuildProject(projectRoot: string): Promise<boolean> {
  try {
    // Check if package.json exists and has build script
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    
    if (!packageJson.scripts || !packageJson.scripts.build) {
      return false;
    }
    
    // Run the build command
    await execAsync('npm run build', { cwd: projectRoot });
    return true;
  } catch (error) {
    return false;
  }
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
      changes.push({ summary: 'Rebuild wellwell project to create executable' });
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
      
      // Check if the built executable exists and rebuild if needed
      const builtExecutable = path.join(projectRoot, 'dist', 'cli', 'index.js');
      let needsRebuild = false;
      try {
        await fs.access(builtExecutable);
      } catch {
        needsRebuild = true;
      }
      
      if (needsRebuild) {
        ctx.logger.info('Rebuilding wellwell project...');
        const rebuildSuccess = await rebuildProject(projectRoot);
        if (!rebuildSuccess) {
          return { 
            success: false, 
            error: new Error('Failed to rebuild wellwell project'), 
            message: 'Build failed' 
          };
        }
      }
      
      const binDir = path.join(ctx.homeDir, 'bin');
      const isWwAvailable = await isWwCommandAvailable();
      
      // Always ensure ~/bin directory exists and ww script is up to date
      await fs.mkdir(binDir, { recursive: true });
      await createWwScript(projectRoot, binDir);
      
      const message = needsRebuild 
        ? 'Rebuilt project and updated "ww" command script'
        : isWwAvailable 
          ? '"ww" command script updated'
          : 'Created "ww" command script';
      
      return { 
        success: true, 
        changed: true, 
        message 
      };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(_ctx): Promise<StatusResult> {
    const projectRoot = await getWellwellProjectRoot();
    if (!projectRoot) {
      return { status: 'stale', message: 'Project root not found' };
    }
    
    // Check if the built executable exists
    const builtExecutable = path.join(projectRoot, 'dist', 'cli', 'index.js');
    try {
      await fs.access(builtExecutable);
    } catch {
      return { status: 'stale', message: 'Wellwell not built' };
    }
    
    const isWwAvailable = await isWwCommandAvailable();
    if (isWwAvailable) {
      return { status: 'applied', message: '"ww" command available' };
    } else {
      return { status: 'stale', message: '"ww" command not found' };
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
