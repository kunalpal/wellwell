import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from '../../core/types.js';
import {
  readResolvedPackages,
  resolvePackages,
  writeResolvedPackages,
} from '../../core/contrib.js';

const execAsync = promisify(exec);

async function isYumAvailable(): Promise<boolean> {
  try {
    await execAsync('which yum');
    return true;
  } catch {
    return false;
  }
}

async function getInstalledPackages(): Promise<Set<string>> {
  try {
    const { stdout } = await execAsync('yum list installed | awk \'{print $1}\' | grep -v "^Loaded\\|^Installed" | sed \'s/\\..*//\'');
    return new Set(stdout.trim().split('\n').filter(Boolean));
  } catch {
    return new Set();
  }
}

async function installPackages(packages: string[]): Promise<{ installed: string[]; failed: string[] }> {
  const installed: string[] = [];
  const failed: string[] = [];
  
  // Install all at once for efficiency
  try {
    const packageList = packages.join(' ');
    await execAsync(`sudo yum install -y ${packageList}`);
    installed.push(...packages);
  } catch {
    // Fall back to individual installation to identify failures
    for (const pkg of packages) {
      try {
        await execAsync(`sudo yum install -y ${pkg}`);
        installed.push(pkg);
      } catch {
        failed.push(pkg);
      }
    }
  }
  
  return { installed, failed };
}

export const yumModule: ConfigurationModule = {
  id: 'packages:yum',
  description: 'YUM package manager for Amazon Linux 2',
  priority: 15,

  async isApplicable(ctx) {
    return ctx.platform === 'al2' && await isYumAvailable();
  },

  async plan(ctx): Promise<PlanResult> {
    const changes = [];
    const resolvedPackages = resolvePackages(ctx);
    const yumPackages = resolvedPackages.yum ?? [];
    
    if (yumPackages.length > 0) {
      const installed = await getInstalledPackages();
      const toInstall = yumPackages.filter(p => !installed.has(p.name));
      
      if (toInstall.length > 0) {
        changes.push({ 
          summary: `Install ${toInstall.length} YUM packages: ${toInstall.map(p => p.name).join(', ')}` 
        });
      }
    }
    
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      const resolvedPackages = resolvePackages(ctx);
      const yumPackages = resolvedPackages.yum ?? [];
      
      if (yumPackages.length > 0) {
        const installed = await getInstalledPackages();
        const toInstall = yumPackages.filter(p => !installed.has(p.name)).map(p => p.name);
        
        if (toInstall.length > 0) {
          ctx.logger.info({ packages: toInstall }, 'Installing YUM packages');
          const result = await installPackages(toInstall);
          
          if (result.failed.length > 0) {
            ctx.logger.warn({ failed: result.failed }, 'Some packages failed to install');
          }
          
          writeResolvedPackages(ctx, resolvedPackages);
          return { 
            success: result.failed.length === 0, 
            changed: result.installed.length > 0,
            message: `Installed ${result.installed.length}/${toInstall.length} packages`
          };
        }
      }
      
      writeResolvedPackages(ctx, resolvedPackages);
      return { success: true, changed: false, message: 'YUM packages up to date' };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const isAvailable = await isYumAvailable();
    if (!isAvailable) return { status: 'idle', message: 'YUM not available' };
    
    const resolvedPackages = readResolvedPackages(ctx);
    const yumPackages = resolvedPackages?.yum ?? [];
    
    if (yumPackages.length === 0) {
      return { status: 'applied', message: 'YUM available, no packages' };
    }
    
    const installed = await getInstalledPackages();
    const missing = yumPackages.filter(p => !installed.has(p.name));
    
    return { 
      status: missing.length === 0 ? 'applied' : 'idle',
      message: missing.length > 0 ? `${missing.length} packages missing` : 'All packages installed'
    };
  },
};
