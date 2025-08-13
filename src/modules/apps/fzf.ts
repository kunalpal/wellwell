import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createAppModule, createCrossPlatformPackages } from '../../core/app-module-factory.js';
import { addShellInitContribution } from '../../core/contrib.js';
import { themeContextProvider } from '../../core/theme-context.js';
import { templateManager } from '../../core/template-manager.js';

export const fzfModule = createAppModule({
  id: 'apps:fzf',
  description: 'Fzf - command-line fuzzy finder',
  dependsOn: ['apps:ripgrep', 'themes:base16'], // fzf requires ripgrep as backend and theme support
  priority: 61,
  packageName: 'fzf',
  packageMappings: createCrossPlatformPackages('fzf'),

  customApply: async (ctx) => {
    try {
      // Load module partials
      await templateManager.loadModulePartials('apps');
      
      // Get current theme and generate theme-aware fzf configuration
      const currentTheme = ctx.state.get<string>('themes.current') || 'dracula';
      const themeColors = await themeContextProvider.getThemeColors(currentTheme);
      
      // Generate context with theme colors
      const context = {
        ...themeColors,
        themeName: currentTheme,
      };
      
      // Load and render the template
      const fzfConfig = await templateManager.loadAndRender('apps', 'fzf.zsh.hbs', context);
      
      const fzfConfigPath = path.join(process.env.HOME || '', '.fzf.zsh');
      await fs.writeFile(fzfConfigPath, fzfConfig);
      
      // Add shell initialization for fzf using template
      const initContext = {
        name: 'fzf',
        command: 'fzf',
        sourcePath: '~/.fzf.zsh',
        customInit: `# Set fzf to use ripgrep as default command
  export FZF_DEFAULT_COMMAND='rg --files --hidden --follow --glob "!.git/*"'
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
  
  # fzf key bindings and completion
  if [[ -f /opt/homebrew/opt/fzf/shell/key-bindings.zsh ]]; then
    source /opt/homebrew/opt/fzf/shell/key-bindings.zsh
    source /opt/homebrew/opt/fzf/shell/completion.zsh
  elif [[ -f /usr/share/fzf/key-bindings.zsh ]]; then
    source /usr/share/fzf/key-bindings.zsh
    source /usr/share/fzf/completion.zsh
  fi`,
      };
      
      const initCode = await templateManager.loadAndRender('shell', 'shell-init.zsh.hbs', initContext);
      
      addShellInitContribution(ctx, {
        name: 'fzf',
        initCode,
      });
      
      return { success: true, changed: true, message: 'Fzf configured with theme-aware colors' };
    } catch (error) {
      return { success: false, error };
    }
  },

  customStatus: async (ctx) => {
    try {
      // Check if fzf is available in PATH
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      
      await execAsync('which fzf');
      
      // Check if theme-aware configuration exists
      const fzfConfigPath = path.join(process.env.HOME || '', '.fzf.zsh');
      await fs.access(fzfConfigPath);
      
      return { status: 'applied', message: 'Fzf available and configured with theme' };
    } catch {
      return { status: 'stale', message: 'Fzf not found or configuration missing' };
    }
  },

  getDetails: (_ctx) => [
    'Fuzzy finder configuration:',
    '  • Backend: ripgrep for file search',
    '  • Key bindings: Ctrl+T, Ctrl+R, Alt+C',
    '  • Completion: Command line completion',
  ],
});
