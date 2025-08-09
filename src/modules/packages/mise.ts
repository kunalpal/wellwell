import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from '../../core/types.js';
import {
  addPackageContribution,
  addShellInitContribution,
  readResolvedPackages,
  resolvePackages,
  writeResolvedPackages,
} from '../../core/contrib.js';

const execAsync = promisify(exec);

async function isMiseInstalled(): Promise<boolean> {
  try {
    await execAsync('which mise');
    return true;
  } catch {
    return false;
  }
}

async function installMise(): Promise<void> {
  const script = 'curl https://mise.run | sh';
  await execAsync(script);
}

async function getInstalledLanguages(): Promise<Record<string, string[]>> {
  try {
    const { stdout } = await execAsync('mise list');
    const languages: Record<string, string[]> = {};
    const lines = stdout.trim().split('\n').filter(Boolean);
    
    for (const line of lines) {
      const match = line.match(/^(\w+)\s+(\S+)/);
      if (match) {
        const [, lang, version] = match;
        if (!languages[lang]) languages[lang] = [];
        languages[lang].push(version);
      }
    }
    
    return languages;
  } catch {
    return {};
  }
}

function isVersionSatisfied(requestedVersion: string, installedVersions: string[]): boolean {
  if (requestedVersion === 'lts' || requestedVersion === 'latest') {
    // For lts/latest, any installed version counts as satisfied
    return installedVersions.length > 0;
  }
  
  // Check for exact match first
  if (installedVersions.includes(requestedVersion)) {
    return true;
  }
  
  // Check for partial version match (e.g. "3.11" matches "3.11.9", "3.11.13")
  return installedVersions.some(installed => installed.startsWith(requestedVersion + '.'));
}

async function installLanguageVersion(language: string, version: string): Promise<boolean> {
  try {
    await execAsync(`mise install ${language}@${version}`);
    return true;
  } catch {
    return false;
  }
}

async function setGlobalVersion(language: string, version: string): Promise<boolean> {
  try {
    await execAsync(`mise global ${language}@${version}`);
    return true;
  } catch {
    return false;
  }
}

const defaultVersions = [
  { language: 'node', version: 'lts', platforms: ['macos', 'ubuntu', 'al2'] },
  { language: 'python', version: '3.11', platforms: ['macos', 'ubuntu', 'al2'] },
] as const;

export const miseModule: ConfigurationModule = {
  id: 'packages:mise',
  description: 'Mise version manager for Node.js, Python, etc.',
  priority: 20,

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    const changes = [];
    const isInstalled = await isMiseInstalled();
    
    if (!isInstalled) {
      changes.push({ summary: 'Install mise version manager' });
    }
    
    // Register default versions
    for (const def of defaultVersions) {
      addPackageContribution(ctx, {
        name: def.language,
        manager: 'mise',
        language: def.language,
        version: def.version,
        platforms: [...def.platforms],
      });
    }
    
    const resolvedPackages = resolvePackages(ctx);
    const misePackages = resolvedPackages.mise ?? [];
    
    if (misePackages.length > 0) {
      const installed = await getInstalledLanguages();
      const toInstall = misePackages.filter(p => {
        const versions = installed[p.language!] ?? [];
        return !isVersionSatisfied(p.version!, versions);
      });
      
      if (toInstall.length > 0) {
        changes.push({ 
          summary: `Install ${toInstall.length} language versions: ${toInstall.map(p => `${p.language}@${p.version}`).join(', ')}` 
        });
      }
    }
    
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      // Register shell initialization
      addShellInitContribution(ctx, {
        name: 'mise',
        initCode: `# Initialize mise if available
if command -v mise > /dev/null 2>&1; then
  eval "$(mise activate zsh)"
fi`,
      });
      
      const isInstalled = await isMiseInstalled();
      
      if (!isInstalled) {
        ctx.logger.info('Installing mise...');
        await installMise();
        // Add mise to PATH for this session
        process.env.PATH = `${ctx.homeDir}/.local/bin:${process.env.PATH}`;
      }
      
      const resolvedPackages = resolvePackages(ctx);
      const misePackages = resolvedPackages.mise ?? [];
      
      if (misePackages.length > 0) {
        const installed = await getInstalledLanguages();
        const toInstall = misePackages.filter(p => {
          const versions = installed[p.language!] ?? [];
          return !isVersionSatisfied(p.version!, versions);
        });
        
        if (toInstall.length > 0) {
          ctx.logger.info({ packages: toInstall.map(p => `${p.language}@${p.version}`) }, 'Installing language versions');
          
          let installCount = 0;
          const failed: string[] = [];
          
          for (const pkg of toInstall) {
            const success = await installLanguageVersion(pkg.language!, pkg.version!);
            if (success) {
              installCount++;
              // Set as global version if it's the first/only version
              const currentVersions = installed[pkg.language!] ?? [];
              if (currentVersions.length === 0) {
                await setGlobalVersion(pkg.language!, pkg.version!);
              }
            } else {
              failed.push(`${pkg.language}@${pkg.version}`);
            }
          }
          
          if (failed.length > 0) {
            ctx.logger.warn({ failed }, 'Some language versions failed to install');
          }
          
          return { 
            success: failed.length === 0, 
            changed: installCount > 0,
            message: `Installed ${installCount}/${toInstall.length} language versions`
          };
        }
      }
      
      writeResolvedPackages(ctx, resolvedPackages);
      return { success: true, changed: false, message: 'Mise up to date' };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const isInstalled = await isMiseInstalled();
    if (!isInstalled) return { status: 'idle', message: 'Mise not installed' };
    
    const resolvedPackages = readResolvedPackages(ctx);
    const misePackages = resolvedPackages?.mise ?? [];
    
    if (misePackages.length === 0) {
      return { status: 'applied', message: 'Mise installed, no language versions' };
    }
    
    const installed = await getInstalledLanguages();
    const missing = misePackages.filter(p => {
      const versions = installed[p.language!] ?? [];
      return !isVersionSatisfied(p.version!, versions);
    });
    
    return { 
      status: missing.length === 0 ? 'applied' : 'idle',
      message: missing.length > 0 ? `${missing.length} language versions missing` : 'All language versions installed'
    };
  },

  getDetails(ctx): string[] {
    const resolvedPackages = readResolvedPackages(ctx);
    const packages = resolvedPackages?.mise ?? [];
    
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
