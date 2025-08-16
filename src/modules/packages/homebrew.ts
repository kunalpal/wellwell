import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  PackageManager,
  type PackageManagerConfig,
} from "../../core/package-manager.js";

const execAsync = promisify(exec);

/**
 * Homebrew package manager implementation for macOS.
 * Extends the generic PackageManager with Homebrew-specific commands and logic for formulas and casks.
 */
class HomebrewPackageManager extends PackageManager {
  protected config: PackageManagerConfig = {
    name: "Homebrew",
    command: "homebrew",
    installCommand: "brew install",
    listCommand: "brew list --formula -1 && brew list --cask -1",
    platforms: ["macos"],
    requiresSudo: false,
  };

  constructor() {
    super({
      id: "packages:homebrew",
      description: "Homebrew package manager for macOS",
      dependsOn: ["core:paths"],
    });
  }

  /**
   * Checks if Homebrew is available on the system.
   * @returns Promise resolving to true if Homebrew is installed, false otherwise.
   */
  protected async isAvailable(): Promise<boolean> {
    try {
      await execAsync("which brew");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Installs the specified packages using Homebrew, trying both formula and cask.
   * @param packages Array of package names to install.
   * @returns Object with arrays of installed and failed package names.
   */
  protected async installPackages(
    packages: string[],
  ): Promise<{ installed: string[]; failed: string[] }> {
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

  /**
   * Gets the set of installed Homebrew formulas and casks.
   * @returns Set of installed package names.
   */
  protected async getInstalledPackages(): Promise<Set<string>> {
    try {
      // Get both formulas and casks
      const [formulaResult, caskResult] = await Promise.all([
        execAsync("brew list --formula -1").catch(() => ({ stdout: "" })),
        execAsync("brew list --cask -1").catch(() => ({ stdout: "" })),
      ]);

      const formulas = formulaResult.stdout.trim().split("\n").filter(Boolean);
      const casks = caskResult.stdout.trim().split("\n").filter(Boolean);

      return new Set([...formulas, ...casks]);
    } catch {
      return new Set();
    }
  }

  /**
   * Applies the Homebrew package manager configuration, installing Homebrew if necessary.
   * @param ctx The configuration context.
   * @returns The result of the apply operation.
   */
  async apply(ctx: any): Promise<any> {
    try {
      const isInstalled = await this.isAvailable();

      if (!isInstalled) {
        this.logProgress(ctx, "Installing Homebrew...");
        const script =
          '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
        await execAsync(script);
      }

      return super.apply(ctx);
    } catch (error) {
      return this.createErrorResult(error);
    }
  }
}

/**
 * The singleton instance of the HomebrewPackageManager module for use in the configuration engine.
 */
export const homebrewModule = new HomebrewPackageManager();
