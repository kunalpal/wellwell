import { promises as fs } from 'node:fs';
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
import { addShellInitContribution } from '../../core/contrib.js';
import { templateManager } from '../../core/template-manager.js';
import { themeContextProvider } from '../../core/theme-context.js';

const execAsync = promisify(exec);

async function isStarshipInstalled(): Promise<boolean> {
  try {
    await execAsync('which starship');
    return true;
  } catch {
    return false;
  }
}

async function installStarship(): Promise<void> {
  // Use the official starship installer script
  const script = 'curl -sS https://starship.rs/install.sh | sh -s -- --yes';
  await execAsync(script);
}

async function getStarshipConfig(ctx: ConfigurationContext): Promise<string> {
  // Load module partials
  await templateManager.loadModulePartials('shell');
  
  // Get current theme from context
  const currentTheme = ctx.state.get<string>('themes.current') || 'dracula';
  
  // Get theme colors from theme context provider
  const themeColors = await themeContextProvider.getThemeColors(currentTheme);
  
  // Generate context with theme colors
  const context = {
    ...themeColors,
    themeName: currentTheme,
  };
  
  // Load and render the template
  return templateManager.loadAndRender('shell', 'starship.toml.hbs', context);
}

export const starshipModule: ConfigurationModule = {
  id: 'shell:starship',
  description: 'Starship cross-shell prompt',
  priority: 30, // Install early, no dependencies on package managers
  dependsOn: ['themes:base16'],

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    const changes = [];
    
    try {
      const isInstalled = await isStarshipInstalled();
      if (!isInstalled) {
        changes.push({ summary: 'Install starship prompt via official installer' });
      }
      
      const configDir = path.join(ctx.homeDir, '.config');
      const configFile = path.join(configDir, 'starship.toml');
      
      try {
        const currentConfig = await fs.readFile(configFile, 'utf8');
        const expectedConfig = await getStarshipConfig(ctx);
        if (currentConfig !== expectedConfig) {
          changes.push({ summary: `Update starship config at ${configFile}` });
        }
      } catch {
        changes.push({ summary: `Create starship config at ${configFile}` });
      }
      
      return { changes };
    } catch (error) {
      ctx.logger.error({ error, module: 'shell:starship' }, 'Error in plan method');
      throw error;
    }
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      // Register shell initialization
      addShellInitContribution(ctx, {
        name: 'starship',
        initCode: `# Initialize starship prompt if available
if command -v starship > /dev/null 2>&1; then
  eval "$(starship init zsh)"
fi`,
      });
      
      const isInstalled = await isStarshipInstalled();
      let installChanged = false;
      
      if (!isInstalled) {
        ctx.logger.info('Installing starship via official installer...');
        await installStarship();
        installChanged = true;
        
        // Add ~/.local/bin to PATH for this session in case starship was installed there
        const localBin = path.join(ctx.homeDir, '.local', 'bin');
        if (!process.env.PATH?.includes(localBin)) {
          process.env.PATH = `${localBin}:${process.env.PATH}`;
        }
      }
      
      const configDir = path.join(ctx.homeDir, '.config');
      const configFile = path.join(configDir, 'starship.toml');
      
      // Ensure config directory exists
      await fs.mkdir(configDir, { recursive: true });
      
      // Write starship configuration
      const config = await getStarshipConfig(ctx);
      let configChanged = false;
      
      try {
        const currentConfig = await fs.readFile(configFile, 'utf8');
        if (currentConfig !== config) {
          await fs.writeFile(configFile, config, 'utf8');
          configChanged = true;
        }
      } catch {
        await fs.writeFile(configFile, config, 'utf8');
        configChanged = true;
      }
      
      if (configChanged) {
        ctx.logger.info({ file: configFile }, 'Created/updated starship configuration');
      }
      
      const changed = installChanged || configChanged;
      const message = installChanged ? 'Starship installed and configured' : 'Starship configured';
      
      return { success: true, changed, message };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const isInstalled = await isStarshipInstalled();
    if (!isInstalled) {
      return { status: 'stale', message: 'Starship not installed' };
    }
    
    const configFile = path.join(ctx.homeDir, '.config', 'starship.toml');
    try {
      await fs.access(configFile);
      return { status: 'applied', message: 'Starship configured' };
    } catch {
      return { status: 'stale', message: 'Starship config missing' };
    }
  },

  getDetails(_ctx): string[] {
    return [
      'Cross-shell prompt:',
      '  • Git integration',
      '  • Language version display',
      '  • Custom prompt format',
    ];
  },
};
