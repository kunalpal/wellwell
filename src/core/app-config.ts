import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Platform } from './types.js';
import { BaseModule, type BaseModuleOptions } from './base-module.js';
import type {
  ApplyResult,
  ConfigurationContext,
  PlanResult,
  StatusResult,
} from './types.js';
import { addPackageContribution } from './contrib.js';

export interface AppConfigOptions extends BaseModuleOptions {
  configDir: string;
  configFile: string;
  platforms?: Platform[];
  packageDependencies?: Array<{
    name: string;
    manager: 'homebrew' | 'apt' | 'yum';
    platforms?: Platform[];
  }>;
  template?: (ctx: ConfigurationContext, themeColors?: any) => string;
}

export abstract class AppConfig extends BaseModule {
  protected configDir: string;
  protected configFile: string;
  protected platforms?: Platform[];
  protected packageDependencies?: Array<{
    name: string;
    manager: 'homebrew' | 'apt' | 'yum';
    platforms?: Platform[];
  }>;
  protected template?: (ctx: ConfigurationContext, themeColors?: any) => string;

  constructor(options: AppConfigOptions) {
    super(options);
    this.configDir = options.configDir;
    this.configFile = options.configFile;
    this.platforms = options.platforms;
    this.packageDependencies = options.packageDependencies;
    this.template = options.template;
  }

  async isApplicable(ctx: ConfigurationContext): Promise<boolean> {
    if (this.platforms && !this.platforms.includes(ctx.platform)) {
      return false;
    }
    return true;
  }

  protected getConfigPath(ctx: ConfigurationContext): string {
    return path.join(ctx.homeDir, this.configDir, this.configFile);
  }

  protected async ensureConfigExists(ctx: ConfigurationContext): Promise<void> {
    const configPath = this.getConfigPath(ctx);
    const configDir = path.dirname(configPath);
    
    await fs.mkdir(configDir, { recursive: true });
    
    // Handle broken symlinks
    try {
      const st = await fs.lstat(configPath);
      if (st.isSymbolicLink()) {
        try {
          await fs.readFile(configPath);
        } catch {
          await fs.unlink(configPath);
        }
      }
    } catch {
      // File doesn't exist, which is fine
    }
  }

  protected async writeConfig(ctx: ConfigurationContext, content: string): Promise<void> {
    const configPath = this.getConfigPath(ctx);
    await this.ensureConfigExists(ctx);
    await fs.writeFile(configPath, content, 'utf8');
  }

  protected async readConfig(ctx: ConfigurationContext): Promise<string | null> {
    try {
      const configPath = this.getConfigPath(ctx);
      return await fs.readFile(configPath, 'utf8');
    } catch {
      return null;
    }
  }

  protected async configExists(ctx: ConfigurationContext): Promise<boolean> {
    try {
      const configPath = this.getConfigPath(ctx);
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  async plan(ctx: ConfigurationContext): Promise<PlanResult> {
    const changes = [];
    
    // Add package dependencies
    if (this.packageDependencies) {
      for (const dep of this.packageDependencies) {
        if (!dep.platforms || dep.platforms.includes(ctx.platform)) {
          addPackageContribution(ctx, dep);
        }
      }
    }
    
    // Check if config needs to be created/updated
    if (this.template) {
      const exists = await this.configExists(ctx);
      if (!exists) {
        changes.push({ summary: `Create ${this.configFile} configuration` });
      } else {
        changes.push({ summary: `Update ${this.configFile} configuration` });
      }
    }
    
    return this.createPlanResult(changes);
  }

  async apply(ctx: ConfigurationContext): Promise<ApplyResult> {
    try {
      if (this.template) {
        // Get theme colors if available
        let themeColors: any = undefined;
        try {
          const currentTheme = ctx.state.get<string>('themes.current') || 'dracula';
          const { themeContextProvider } = await import('./theme-context.js');
          themeColors = await themeContextProvider.getThemeColors(currentTheme);
        } catch {
          // Theme colors not available, continue without them
        }
        
        const content = this.template(ctx, themeColors);
        await this.writeConfig(ctx, content);
        
        this.logProgress(ctx, `Created ${this.configFile} configuration`);
        return this.createSuccessResult(true, `Configuration created/updated`);
      }
      
      return this.createSuccessResult(false, 'No configuration template');
    } catch (error) {
      return this.createErrorResult(error);
    }
  }

  async status(ctx: ConfigurationContext): Promise<StatusResult> {
    const exists = await this.configExists(ctx);
    if (!exists) {
      return { status: 'stale', message: `${this.configFile} missing` };
    }
    
    return { status: 'applied', message: `${this.configFile} exists` };
  }

  getDetails(_ctx: ConfigurationContext): string[] {
    return [
      `App configuration:`,
      `  • Config file: ${this.configFile}`,
      `  • Config directory: ${this.configDir}`,
      ...(this.packageDependencies ? [`  • Package dependencies: ${this.packageDependencies.length}`] : []),
    ];
  }
}
