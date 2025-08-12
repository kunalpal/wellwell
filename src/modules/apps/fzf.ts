import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createAppModule, createCrossPlatformPackages } from '../../core/app-module-factory.js';
import { addShellInitContribution } from '../../core/contrib.js';
import { themeContextProvider } from '../../core/theme-context.js';

export const fzfModule = createAppModule({
  id: 'apps:fzf',
  description: 'Fzf - command-line fuzzy finder',
  dependsOn: ['apps:ripgrep', 'themes:base16'], // fzf requires ripgrep as backend and theme support
  priority: 61,
  packageName: 'fzf',
  packageMappings: createCrossPlatformPackages('fzf'),

  customApply: async (ctx) => {
    try {
      // Generate theme-aware fzf configuration
      const currentTheme = ctx.state.get<string>('themes.current') || 'dracula';
      const themeColors = await themeContextProvider.getThemeColors(currentTheme);
      
      const fzfConfig = `export FZF_DEFAULT_OPTS=$FZF_DEFAULT_OPTS'
  --color=fg:${themeColors.base05},fg+:${themeColors.base07},bg:${themeColors.base00},bg+:${themeColors.base02}
  --color=hl:${themeColors.base0D},hl+:${themeColors.base0C},info:${themeColors.base0A},marker:${themeColors.base0B}
  --color=prompt:${themeColors.base08},spinner:${themeColors.base0E},pointer:${themeColors.base0D},header:${themeColors.base0C}
  --color=border:${themeColors.base02},label:${themeColors.base04},query:${themeColors.base05}
  --border="rounded" --border-label="" --preview-window="border-rounded" --prompt="❯ "
  --marker="◆" --pointer="◆" --separator="" --scrollbar="│"
  --layout="reverse" --info="right"'`;
      
      const fzfConfigPath = path.join(process.env.HOME || '', '.fzf.zsh');
      await fs.writeFile(fzfConfigPath, fzfConfig);
      
      // Add shell initialization for fzf
      addShellInitContribution(ctx, {
        name: 'fzf',
        initCode: `# Initialize fzf if available
if command -v fzf > /dev/null 2>&1; then
  # Set fzf to use ripgrep as default command
  export FZF_DEFAULT_COMMAND='rg --files --hidden --follow --glob "!.git/*"'
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
  
  # Source theme-aware fzf configuration
  if [[ -f ~/.fzf.zsh ]]; then
    source ~/.fzf.zsh
  fi
  
  # fzf key bindings and completion
  if [[ -f /opt/homebrew/opt/fzf/shell/key-bindings.zsh ]]; then
    source /opt/homebrew/opt/fzf/shell/key-bindings.zsh
    source /opt/homebrew/opt/fzf/shell/completion.zsh
  elif [[ -f /usr/share/fzf/key-bindings.zsh ]]; then
    source /usr/share/fzf/key-bindings.zsh
    source /usr/share/fzf/completion.zsh
  fi
fi`,
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
