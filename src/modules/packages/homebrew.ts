import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { PackageManager, type PackageManagerConfig } from '../../core/package-manager.js';

const execAsync = promisify(exec);

class HomebrewPackageManager extends PackageManager {
  protected config: PackageManagerConfig = {
    name: 'Homebrew',
    command: 'homebrew',
    installCommand: 'brew install',
    listCommand: 'brew list --formula -1 && brew list --cask -1',
    platforms: ['macos'],
    requiresSudo: false,
  };

  constructor() {
    super({
      id: 'packages:homebrew',
      description: 'Homebrew package manager for macOS',
      priority: 15,
    });
  }

  protected async isAvailable(): Promise<boolean> {
    try {
      await execAsync('which brew');
      return true;
    } catch {
      return false;
    }
  }

  protected async installPackages(packages: string[]): Promise<{ installed: string[]; failed: string[] }> {
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

  protected async getInstalledPackages(): Promise<Set<string>> {
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

  async apply(ctx: any): Promise<any> {
    try {
      const isInstalled = await this.isAvailable();
      
      if (!isInstalled) {
        this.logProgress(ctx, 'Installing Homebrew...');
        const script = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
        await execAsync(script);
      }
      
      return super.apply(ctx);
    } catch (error) {
      return this.createErrorResult(error);
    }
  }
}

export const homebrewModule = new HomebrewPackageManager();
