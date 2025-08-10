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

async function isAptAvailable(): Promise<boolean> {
  try {
    await execAsync('which apt');
    return true;
  } catch {
    return false;
  }
}

async function updatePackageCache(): Promise<void> {
  await execAsync('sudo apt update');
}

async function getInstalledPackages(): Promise<Set<string>> {
  try {
    const { stdout } = await execAsync('dpkg -l | grep "^ii" | awk \'{print $2}\'');
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
    await execAsync(`sudo apt install -y ${packageList}`);
    installed.push(...packages);
  } catch {
    // Fall back to individual installation to identify failures
    for (const pkg of packages) {
      try {
        await execAsync(`sudo apt install -y ${pkg}`);
        installed.push(pkg);
      } catch {
        failed.push(pkg);
      }
    }
  }
  
  return { installed, failed };
}

export const aptModule: ConfigurationModule = {
  id: 'packages:apt',
  description: 'APT package manager for Ubuntu/Debian',
  priority: 15,

  async isApplicable(ctx) {
    return ctx.platform === 'ubuntu' && await isAptAvailable();
  },

  async plan(ctx): Promise<PlanResult> {
    const changes = [];
    const resolvedPackages = resolvePackages(ctx);
    const aptPackages = resolvedPackages.apt ?? [];
    
    if (aptPackages.length > 0) {
      const installed = await getInstalledPackages();
      const toInstall = aptPackages.filter(p => !installed.has(p.name));
      
      if (toInstall.length > 0) {
        changes.push({ 
          summary: `Update package cache and install ${toInstall.length} APT packages: ${toInstall.map(p => p.name).join(', ')}` 
        });
      } else {
        changes.push({ summary: 'Update package cache' });
      }
    }
    
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      // Always update cache first
      ctx.logger.info('Updating APT package cache...');
      await updatePackageCache();
      
      const resolvedPackages = resolvePackages(ctx);
      const aptPackages = resolvedPackages.apt ?? [];
      
      if (aptPackages.length > 0) {
        const installed = await getInstalledPackages();
        const toInstall = aptPackages.filter(p => !installed.has(p.name)).map(p => p.name);
        
        if (toInstall.length > 0) {
          ctx.logger.info({ packages: toInstall }, 'Installing APT packages');
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
      return { success: true, changed: false, message: 'APT packages up to date' };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const isAvailable = await isAptAvailable();
    if (!isAvailable) return { status: 'stale', message: 'APT not available' };
    
    const resolvedPackages = readResolvedPackages(ctx);
    const aptPackages = resolvedPackages?.apt ?? [];
    
    if (aptPackages.length === 0) {
      return { status: 'applied', message: 'APT available, no packages' };
    }
    
    const installed = await getInstalledPackages();
    const missing = aptPackages.filter(p => !installed.has(p.name));
    
    return { 
      status: missing.length === 0 ? 'applied' : 'stale',
      message: missing.length > 0 ? `${missing.length} packages missing` : 'All packages installed'
    };
  },

  getDetails(ctx): string[] {
    const resolvedPackages = readResolvedPackages(ctx);
    const packages = resolvedPackages?.apt ?? [];
    
    if (packages.length > 0) {
      const details = [`Managing ${packages.length} packages:`];
      packages.forEach(pkg => {
        if (pkg.language && pkg.version) {
          details.push(`  • ${pkg.language}@${pkg.version}`);
        } else {
          details.push(`  • ${pkg.name}`);
        }
      });
      return details;
    } else {
      return ['No packages configured'];
    }
  },
};
