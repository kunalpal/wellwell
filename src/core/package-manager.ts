import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Platform } from './types.js';
import { BaseModule, type BaseModuleOptions } from './base-module.js';
import type {
  ApplyResult,
  ConfigurationContext,
  PlanResult,
  StatusResult,
} from './types.js';
import {
  readResolvedPackages,
  resolvePackages,
  writeResolvedPackages,
} from './contrib.js';

const execAsync = promisify(exec);

export interface PackageManagerConfig {
  name: string;
  command: string;
  installCommand: string;
  listCommand: string;
  updateCommand?: string;
  platforms: Platform[];
  requiresSudo?: boolean;
  installFlags?: string[];
}

export interface PackageInstallResult {
  installed: string[];
  failed: string[];
}

export abstract class PackageManager extends BaseModule {
  protected abstract config: PackageManagerConfig;

  constructor(options: BaseModuleOptions) {
    super(options);
  }

  async isApplicable(ctx: ConfigurationContext): Promise<boolean> {
    return this.config.platforms.includes(ctx.platform) && await this.isAvailable();
  }

  protected async isAvailable(): Promise<boolean> {
    try {
      await execAsync(`which ${this.config.command}`);
      return true;
    } catch {
      return false;
    }
  }

  protected async updatePackageCache(): Promise<void> {
    if (this.config.updateCommand) {
      const command = this.config.requiresSudo ? `sudo ${this.config.updateCommand}` : this.config.updateCommand;
      await execAsync(command);
    }
  }

  protected async getInstalledPackages(): Promise<Set<string>> {
    try {
      const { stdout } = await execAsync(this.config.listCommand);
      const packages = stdout.trim().split('\n').filter(Boolean);
      return new Set(packages);
    } catch {
      return new Set();
    }
  }

  protected async installPackages(packages: string[]): Promise<PackageInstallResult> {
    const installed: string[] = [];
    const failed: string[] = [];

    if (packages.length === 0) {
      return { installed, failed };
    }

    const flags = this.config.installFlags?.join(' ') || '';
    const command = this.config.requiresSudo ? 
      `sudo ${this.config.installCommand} ${flags} ${packages.join(' ')}` :
      `${this.config.installCommand} ${flags} ${packages.join(' ')}`;

    try {
      await execAsync(command);
      installed.push(...packages);
    } catch {
      // Fall back to individual installation
      for (const pkg of packages) {
        try {
          const individualCommand = this.config.requiresSudo ?
            `sudo ${this.config.installCommand} ${flags} ${pkg}` :
            `${this.config.installCommand} ${flags} ${pkg}`;
          await execAsync(individualCommand);
          installed.push(pkg);
        } catch {
          failed.push(pkg);
        }
      }
    }

    return { installed, failed };
  }

  async plan(ctx: ConfigurationContext): Promise<PlanResult> {
    const changes = [];
    
    // Check if package manager needs to be installed
    if (!(await this.isAvailable())) {
      changes.push({ summary: `Install ${this.config.name} package manager` });
    }

    const resolvedPackages = resolvePackages(ctx);
    // Use the actual command name for package lookup (e.g., 'brew' for homebrew)
    const packageKey = this.config.command === 'homebrew' ? 'brew' : this.config.command;
    const packages = resolvedPackages[packageKey] ?? [];
    
    if (packages.length > 0) {
      const installed = await this.getInstalledPackages();
      const toInstall = packages.filter(p => !installed.has(p.name));
      
      if (toInstall.length > 0) {
        const updateText = this.config.updateCommand ? 'Update package cache and ' : '';
        changes.push({ 
          summary: `${updateText}Install ${toInstall.length} ${this.config.name} packages: ${toInstall.map(p => p.name).join(', ')}` 
        });
      } else if (this.config.updateCommand) {
        changes.push({ summary: 'Update package cache' });
      }
    }
    
    return this.createPlanResult(changes);
  }

  async apply(ctx: ConfigurationContext): Promise<ApplyResult> {
    try {
      // Update package cache if needed
      if (this.config.updateCommand) {
        this.logProgress(ctx, `Updating ${this.config.name} package cache...`);
        await this.updatePackageCache();
      }
      
      const resolvedPackages = resolvePackages(ctx);
      // Use the actual command name for package lookup (e.g., 'brew' for homebrew)
      const packageKey = this.config.command === 'homebrew' ? 'brew' : this.config.command;
      const packages = resolvedPackages[packageKey] ?? [];
      
      if (packages.length > 0) {
        const installed = await this.getInstalledPackages();
        const toInstall = packages.filter(p => !installed.has(p.name)).map(p => p.name);
        
        if (toInstall.length > 0) {
          this.logProgress(ctx, `Installing ${toInstall.length} ${this.config.name} packages`);
          const result = await this.installPackages(toInstall);
          
          if (result.failed.length > 0) {
            this.logError(ctx, new Error(`Failed to install: ${result.failed.join(', ')}`));
          }
          
          writeResolvedPackages(ctx, resolvedPackages);
          return this.createSuccessResult(
            result.installed.length > 0,
            `Installed ${result.installed.length}/${toInstall.length} packages`
          );
        }
      }
      
      writeResolvedPackages(ctx, resolvedPackages);
      return this.createSuccessResult(false, `${this.config.name} packages up to date`);
    } catch (error) {
      return this.createErrorResult(error);
    }
  }

  async status(ctx: ConfigurationContext): Promise<StatusResult> {
    const isAvailable = await this.isAvailable();
    if (!isAvailable) {
      return { status: 'stale', message: `${this.config.name} not available` };
    }
    
    const resolvedPackages = readResolvedPackages(ctx);
    // Use the actual command name for package lookup (e.g., 'brew' for homebrew)
    const packageKey = this.config.command === 'homebrew' ? 'brew' : this.config.command;
    const packages = resolvedPackages?.[packageKey] ?? [];
    
    if (packages.length === 0) {
      return { status: 'applied', message: `${this.config.name} available, no packages` };
    }
    
    const installed = await this.getInstalledPackages();
    const missing = packages.filter(p => !installed.has(p.name));
    
    return { 
      status: missing.length === 0 ? 'applied' : 'stale',
      message: missing.length > 0 ? `${missing.length} packages missing` : 'All packages installed'
    };
  }

  getDetails(ctx: ConfigurationContext): string[] {
    const resolvedPackages = readResolvedPackages(ctx);
    // Use the actual command name for package lookup (e.g., 'brew' for homebrew)
    const packageKey = this.config.command === 'homebrew' ? 'brew' : this.config.command;
    const packages = resolvedPackages?.[packageKey] ?? [];
    
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
  }
}
