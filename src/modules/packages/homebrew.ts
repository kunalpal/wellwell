import { promises as fs } from 'node:fs';
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

async function isHomebrewInstalled(): Promise<boolean> {
  try {
    await execAsync('which brew');
    return true;
  } catch {
    return false;
  }
}

async function installHomebrew(): Promise<void> {
  const script = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
  await execAsync(script);
}

async function getInstalledPackages(): Promise<Set<string>> {
  try {
    // Get both formulas and casks
    const [formulaResult, caskResult] = await Promise.all([
      execAsync('brew list --formula -1').catch(() => ({ stdout: '' })),
      execAsync('brew list --cask -1').catch(() => ({ stdout: '' }))
    ]);
    
    const formulas = formulaResult.stdout.trim().split('\n').filter(Boolean);
    const casks = caskResult.stdout.trim().split('\n').filter(Boolean);
    
    return new Set([...formulas, ...casks]);
  } catch {
    return new Set();
  }
}

async function installPackages(packages: string[]): Promise<{ installed: string[]; failed: string[] }> {
  const installed: string[] = [];
  const failed: string[] = [];
  
  for (const pkg of packages) {
    try {
      // Try formula first, then cask if formula fails
      try {
        await execAsync(`brew install ${pkg}`);
        installed.push(pkg);
      } catch {
        // If formula installation fails, try as cask
        await execAsync(`brew install --cask ${pkg}`);
        installed.push(pkg);
      }
    } catch {
      failed.push(pkg);
    }
  }
  
  return { installed, failed };
}

export const homebrewModule: ConfigurationModule = {
  id: 'packages:homebrew',
  description: 'Homebrew package manager for macOS',
  priority: 15,

  async isApplicable(ctx) {
    return ctx.platform === 'macos';
  },

  async plan(ctx): Promise<PlanResult> {
    const changes = [];
    const isInstalled = await isHomebrewInstalled();
    
    if (!isInstalled) {
      changes.push({ summary: 'Install Homebrew package manager' });
    }
    
    const resolvedPackages = resolvePackages(ctx);
    const homebrewPackages = resolvedPackages.homebrew ?? [];
    
    if (homebrewPackages.length > 0) {
      const installed = await getInstalledPackages();
      const toInstall = homebrewPackages.filter(p => !installed.has(p.name));
      
      if (toInstall.length > 0) {
        changes.push({ 
          summary: `Install ${toInstall.length} Homebrew packages: ${toInstall.map(p => p.name).join(', ')}` 
        });
      }
    }
    
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      const isInstalled = await isHomebrewInstalled();
      
      if (!isInstalled) {
        ctx.logger.info('Installing Homebrew...');
        await installHomebrew();
      }
      
      const resolvedPackages = resolvePackages(ctx);
      const homebrewPackages = resolvedPackages.homebrew ?? [];
      
      if (homebrewPackages.length > 0) {
        const installed = await getInstalledPackages();
        const toInstall = homebrewPackages.filter(p => !installed.has(p.name)).map(p => p.name);
        
        if (toInstall.length > 0) {
          ctx.logger.info({ packages: toInstall }, 'Installing Homebrew packages');
          const result = await installPackages(toInstall);
          
          if (result.failed.length > 0) {
            ctx.logger.warn({ failed: result.failed }, 'Some packages failed to install');
          }
          
          return { 
            success: result.failed.length === 0, 
            changed: result.installed.length > 0,
            message: `Installed ${result.installed.length}/${toInstall.length} packages`
          };
        }
      }
      
      writeResolvedPackages(ctx, resolvedPackages);
      return { success: true, changed: false, message: 'Homebrew up to date' };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const isInstalled = await isHomebrewInstalled();
    if (!isInstalled) return { status: 'stale', message: 'Homebrew not installed' };
    
    const resolvedPackages = readResolvedPackages(ctx);
    const homebrewPackages = resolvedPackages?.homebrew ?? [];
    
    if (homebrewPackages.length === 0) {
      return { status: 'applied', message: 'Homebrew installed, no packages' };
    }
    
    const installed = await getInstalledPackages();
    const missing = homebrewPackages.filter(p => !installed.has(p.name));
    
    return { 
      status: missing.length === 0 ? 'applied' : 'stale',
      message: missing.length > 0 ? `${missing.length} packages missing` : 'All packages installed'
    };
  },

  getDetails(ctx): string[] {
    const resolvedPackages = readResolvedPackages(ctx);
    const packages = resolvedPackages?.homebrew ?? [];
    
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
