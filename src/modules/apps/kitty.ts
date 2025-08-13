import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { AppConfig, type AppConfigOptions } from '../../core/app-config.js';
import type { ConfigurationContext, Platform } from '../../core/types.js';
import { templateManager } from '../../core/template-manager.js';
import { themeContextProvider } from '../../core/theme-context.js';

const execAsync = promisify(exec);

class KittyConfig extends AppConfig {
  constructor() {
    super({
      id: 'apps:kitty',
      description: 'Kitty terminal emulator with custom configuration (macOS only)',
      dependsOn: ['packages:homebrew', 'themes:base16'],
      priority: 65,
      configDir: '.config/kitty',
      configFile: 'kitty.conf',
      platforms: ['macos'] as Platform[],
      packageDependencies: [
        { name: 'kitty', manager: 'homebrew' as const, platforms: ['macos'] as Platform[] },
      ],
    });
  }

    protected async generateTemplate(ctx: ConfigurationContext): Promise<string> {
    // Load module partials
    await templateManager.loadModulePartials('apps');
    
    // Get current theme and generate theme-aware configuration
    const currentTheme = ctx.state.get<string>('themes.current') || 'dracula';
    const themeColors = await themeContextProvider.getThemeColors(currentTheme);
    
    // Generate context with theme colors
    const context = {
      ...themeColors,
      themeName: currentTheme,
    };
    
    // Load and render the template
    return templateManager.loadAndRender('apps', 'kitty.conf.hbs', context);
  }

  async apply(ctx: ConfigurationContext): Promise<any> {
    try {
      // Check if Kitty is installed via Homebrew
      let installMessage = '';
      try {
        await execAsync('brew list --cask kitty');
        installMessage = 'Kitty already installed';
      } catch {
        // Try to install Kitty
        try {
          await execAsync('brew install --cask kitty');
          installMessage = 'Kitty installed';
        } catch (error) {
          // Check if it's now available (might have been installed by other means)
          try {
            await execAsync('which kitty');
            installMessage = 'Kitty detected (already installed)';
          } catch {
            throw error; // Re-throw if it's actually not installed
          }
        }
      }

      // Generate and write configuration using template
      const content = await this.generateTemplate(ctx);
      await this.writeConfig(ctx, content);
      
      return {
        success: true,
        changed: true,
        message: `${installMessage} and configuration created/updated`,
      };
    } catch (error) {
      return this.createErrorResult(error);
    }
  }



  getDetails(_ctx: ConfigurationContext): string[] {
    return [
      'Modern GPU-accelerated terminal:',
      '  • Tokyo Night color scheme',
      '  • SF Mono font with optimized settings',
      '  • Powerline tab bar with slanted style',
      '  • macOS-specific optimizations',
      '  • Custom key mappings (cmd+c/v, tab navigation)',
      '  • Performance-tuned rendering',
    ];
  }
}

export const kittyModule = new KittyConfig();
