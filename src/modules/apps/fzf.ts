import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
  PlanChange,
} from '../../core/types.js';
import { addPackageContribution, addShellInitContribution } from '../../core/contrib.js';

export const fzfModule: ConfigurationModule = {
  id: 'apps:fzf',
  description: 'Fzf - command-line fuzzy finder',
  dependsOn: ['apps:ripgrep'], // fzf requires ripgrep as backend
  priority: 61,

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    const changes: PlanChange[] = [];
    
    // Add platform-specific package contributions
    addPackageContribution(ctx, {
      name: 'fzf',
      manager: 'homebrew',
      platforms: ['macos'],
    });
    
    addPackageContribution(ctx, {
      name: 'fzf',
      manager: 'apt',
      platforms: ['ubuntu'],
    });
    
    addPackageContribution(ctx, {
      name: 'fzf',
      manager: 'yum',
      platforms: ['al2'],
    });
    
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    // Add shell initialization for fzf
    addShellInitContribution(ctx, {
      name: 'fzf',
      initCode: `# Initialize fzf if available
if command -v fzf > /dev/null 2>&1; then
  # Set fzf to use ripgrep as default command
  export FZF_DEFAULT_COMMAND='rg --files --hidden --follow --glob "!.git/*"'
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
  
  # fzf key bindings and completion
  if [[ -f ~/.fzf.zsh ]]; then
    source ~/.fzf.zsh
  elif [[ -f /opt/homebrew/opt/fzf/shell/key-bindings.zsh ]]; then
    source /opt/homebrew/opt/fzf/shell/key-bindings.zsh
    source /opt/homebrew/opt/fzf/shell/completion.zsh
  elif [[ -f /usr/share/fzf/key-bindings.zsh ]]; then
    source /usr/share/fzf/key-bindings.zsh
    source /usr/share/fzf/completion.zsh
  fi
fi`,
    });
    
    // Package installation is handled by package manager modules
    return { success: true, changed: false, message: 'Package requirements and shell init contributed' };
  },

  async status(_ctx): Promise<StatusResult> {
    // Check if fzf is available in PATH
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      
      await execAsync('which fzf');
      return { status: 'applied', message: 'Fzf available and configured' };
    } catch {
      return { status: 'idle', message: 'Fzf not found in PATH' };
    }
  },

  getDetails(_ctx): string[] {
    return [
      'Fuzzy finder configuration:',
      '  • Backend: ripgrep for file search',
      '  • Key bindings: Ctrl+T, Ctrl+R, Alt+C',
      '  • Completion: Command line completion',
    ];
  },
};
