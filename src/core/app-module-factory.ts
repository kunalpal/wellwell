import type {
  Module,
  ConfigurationContext,
  PlanResult,
  ModuleResult,
  StatusResult,
  Platform,
} from './types.js';
import { ModuleHelpers } from './module-helpers.js';
import { addPackageContribution } from './contrib.js';

export interface AppModuleConfig {
  id: string;
  description: string;
  platforms?: Platform[];
  priority?: number;
  dependsOn?: string[];
  
  // Package management
  packageName: string;
  packageManager?: 'homebrew' | 'apt' | 'yum' | 'mise';
  packageMappings?: Record<Platform, { name: string; manager: 'homebrew' | 'apt' | 'yum' | 'mise' }>;
  
  // Configuration
  configPath?: string;
  template?: (ctx: ConfigurationContext, themeColors?: any) => string;
  
  // Custom commands
  installCommand?: string;
  checkCommand?: string;
  isInstalledCheck?: (ctx: ConfigurationContext) => Promise<boolean>;
  
  // Custom behavior
  customPlan?: (ctx: ConfigurationContext) => Promise<PlanResult>;
  customApply?: (ctx: ConfigurationContext) => Promise<ModuleResult>;
  customStatus?: (ctx: ConfigurationContext) => Promise<StatusResult>;
  
  // Details
  getDetails?: (ctx: ConfigurationContext) => string[];
}

/**
 * Factory function to create standardized app modules
 * Reduces code duplication across similar app configurations
 */
export function createAppModule(config: AppModuleConfig): Module {
  return {
    id: config.id,
    description: config.description,
    priority: config.priority ?? 100,
    dependsOn: config.dependsOn,

    async isApplicable(ctx: ConfigurationContext): Promise<boolean> {
      if (config.platforms && !config.platforms.includes(ctx.platform)) {
        return false;
      }
      return true;
    },

    async plan(ctx: ConfigurationContext): Promise<PlanResult> {
      if (config.customPlan) {
        return config.customPlan(ctx);
      }

      // Default behavior: add package contributions
      if (config.packageMappings) {
        // Use platform-specific package mappings
        for (const [platform, packageInfo] of Object.entries(config.packageMappings)) {
          addPackageContribution(ctx, {
            name: packageInfo.name,
            manager: packageInfo.manager,
            platforms: [platform as Platform],
          });
        }
      } else {
        // Use single package with specified or inferred manager
        const manager = config.packageManager || inferPackageManager(ctx.platform);
        if (manager) {
          addPackageContribution(ctx, {
            name: config.packageName,
            manager,
            platforms: config.platforms,
          });
        }
      }

      return ModuleHelpers.createEmptyPlan();
    },

    async apply(ctx: ConfigurationContext): Promise<ModuleResult> {
      if (config.customApply) {
        return config.customApply(ctx);
      }

      // Default behavior: basic success (packages handled by package managers)
      return ModuleHelpers.createSuccessResult(false, 'Package requirements contributed');
    },

    async status(ctx: ConfigurationContext): Promise<StatusResult> {
      if (config.customStatus) {
        return config.customStatus(ctx);
      }

      try {
        // Check if the app is installed
        if (config.isInstalledCheck) {
          const isInstalled = await config.isInstalledCheck(ctx);
          if (!isInstalled) {
            return { status: 'stale', message: `${config.packageName} not installed` };
          }
        } else if (config.checkCommand) {
          const { exec } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const execAsync = promisify(exec);
          await execAsync(config.checkCommand);
        } else {
          // Default: check if command exists in PATH
          const { exec } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const execAsync = promisify(exec);
          await execAsync(`which ${config.packageName}`);
        }

        return { status: 'applied', message: `${config.packageName.charAt(0).toUpperCase() + config.packageName.slice(1)} available` };
      } catch {
        return { status: 'stale', message: `${config.packageName.charAt(0).toUpperCase() + config.packageName.slice(1)} not found in PATH` };
      }
    },

    getDetails(ctx: ConfigurationContext): string[] {
      if (config.getDetails) {
        return config.getDetails(ctx);
      }
      
      return [
        `${config.description}:`,
        `  • Package: ${config.packageName}`,
        `  • Platforms: ${config.platforms?.join(', ') || 'all'}`,
      ];
    },
  };
}

/**
 * Infer the appropriate package manager for a platform
 */
function inferPackageManager(platform: Platform): 'homebrew' | 'apt' | 'yum' | 'mise' | null {
  switch (platform) {
    case 'macos':
      return 'homebrew';
    case 'ubuntu':
      return 'apt';
    case 'al2':
      return 'yum';
    default:
      return null;
  }
}

/**
 * Helper to create cross-platform package mappings
 */
export function createCrossPlatformPackages(
  packageName: string,
  overrides?: Partial<Record<Platform, { name: string; manager: 'homebrew' | 'apt' | 'yum' | 'mise' }>>
): Record<Platform, { name: string; manager: 'homebrew' | 'apt' | 'yum' | 'mise' }> {
  const defaults = {
    macos: { name: packageName, manager: 'homebrew' as const },
    ubuntu: { name: packageName, manager: 'apt' as const },
    al2: { name: packageName, manager: 'yum' as const },
    unknown: { name: packageName, manager: 'homebrew' as const }, // fallback
  };

  return { ...defaults, ...overrides };
}
