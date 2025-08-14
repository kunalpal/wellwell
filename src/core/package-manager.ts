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
    try {
      // Check if package manager is available
      const isAvailable = await this.isAvailable();
      if (!isAvailable) {
        return this.createStatusResult('stale', `${this.config.name} not available`, {
          issues: [
            `${this.config.name} package manager is not installed`,
            `Required for platform: ${this.config.platforms.join(', ')}`
          ],
          recommendations: [
            `Install ${this.config.name} package manager`,
            this.config.requiresSudo ? 'May require sudo privileges' : 'No sudo required'
          ].filter(Boolean),
        });
      }

      // Get package configuration
      const resolvedPackages = readResolvedPackages(ctx);
      const packageKey = this.config.command === 'homebrew' ? 'brew' : this.config.command;
      const packages = resolvedPackages?.[packageKey] ?? [];
      
      if (packages.length === 0) {
        return this.createStatusResult('applied', `${this.config.name} available, no packages configured`, {
          metadata: {
            version: await this.getVersion(),
            available: true,
            packagesConfigured: 0,
          },
        });
      }

      // Get detailed package status
      const installed = await this.getInstalledPackages();
      const missing = packages.filter(p => !installed.has(p.name));
      const outdated = await this.checkOutdatedPackages(packages, installed);
      const packageValidation = await this.validatePackages(packages, installed);
      
      const issues: string[] = [];
      const recommendations: string[] = [];
      
      // Check for missing packages
      if (missing.length > 0) {
        const missingNames = missing.map(p => p.name);
        issues.push(`${missing.length} packages missing: ${missingNames.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`);
        recommendations.push('Run apply to install missing packages');
      }
      
      // Check for outdated packages
      if (outdated.length > 0) {
        const outdatedNames = outdated.map(p => p.name);
        issues.push(`${outdated.length} packages outdated: ${outdatedNames.slice(0, 5).join(', ')}${outdated.length > 5 ? '...' : ''}`);
        recommendations.push('Run apply to update outdated packages');
      }
      
      // Add validation issues
      if (!packageValidation.valid) {
        issues.push(...packageValidation.issues);
        recommendations.push(...packageValidation.recommendations);
      }
      
      // Determine overall status
      const status = issues.length === 0 ? 'applied' : 'stale';
      const totalProblems = missing.length + outdated.length;
      
      return this.createStatusResult(
        status, 
        totalProblems === 0 ? 
          `All ${packages.length} packages installed and up to date` : 
          `${totalProblems} packages need attention`,
        {
          issues: issues.length > 0 ? issues : undefined,
          recommendations: recommendations.length > 0 ? recommendations : undefined,
          current: {
            installed: Array.from(installed),
            installedCount: installed.size,
            configuredCount: packages.length,
            missing: missing.map(p => p.name),
            outdated: outdated.map(p => p.name),
          },
          desired: {
            packages: packages.map(p => ({ name: p.name, version: p.version })),
            allInstalled: true,
            upToDate: true,
          },
          metadata: {
            packageManager: this.config.name,
            version: await this.getVersion(),
            command: this.config.command,
            requiresSudo: this.config.requiresSudo,
            platforms: this.config.platforms,
            validation: packageValidation,
          },
        }
      );
    } catch (error) {
      return this.handleError(ctx, error, 'package status check').message ?
        this.createStatusResult('failed', 'Error checking package status', {
          issues: [`Status check failed: ${error instanceof Error ? error.message : String(error)}`],
          recommendations: ['Check logs for details', 'Verify package manager is accessible'],
        }) : this.createStatusResult('failed', 'Unknown error', {});
    }
  }

  private async checkOutdatedPackages(packages: any[], installed: Set<string>): Promise<any[]> {
    // Implementation to check for outdated packages
    // This would be specific to each package manager
    // For now, return empty array - can be overridden by subclasses
    return [];
  }

  private async validatePackages(packages: any[], installed: Set<string>): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check for duplicate package names
    const packageNames = packages.map(p => p.name);
    const duplicates = packageNames.filter((name, index) => packageNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      issues.push(`Duplicate packages configured: ${[...new Set(duplicates)].join(', ')}`);
      recommendations.push('Remove duplicate package entries from configuration');
    }
    
    // Check for packages with missing names
    const packagesWithoutNames = packages.filter(p => !p.name || typeof p.name !== 'string');
    if (packagesWithoutNames.length > 0) {
      issues.push(`${packagesWithoutNames.length} packages have invalid names`);
      recommendations.push('Ensure all packages have valid name properties');
    }
    
    // Check for platform compatibility
    const incompatiblePackages = packages.filter(p => 
      p.platforms && Array.isArray(p.platforms) && 
      !p.platforms.some((platform: Platform) => this.config.platforms.includes(platform))
    );
    if (incompatiblePackages.length > 0) {
      issues.push(`${incompatiblePackages.length} packages not compatible with current platforms`);
      recommendations.push('Review package platform requirements');
    }
    
    return {
      valid: issues.length === 0,
      issues,
      recommendations,
    };
  }

  private async getVersion(): Promise<string | undefined> {
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      
      const result = await execAsync(`${this.config.command} --version`);
      return result.stdout.trim();
    } catch {
      return undefined;
    }
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
