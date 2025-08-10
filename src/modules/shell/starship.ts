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

function getStarshipConfig(): string {
  return `# Starship configuration managed by wellwell
format = """
[╭╴](238)$env_var\\
$all[╰─](238)$character"""

[character]
success_symbol = "[❯](bold green)"
error_symbol = "[❯](bold red)"

[directory]
truncation_length = 3
truncation_symbol = "…/"

[git_branch]
symbol = " "

[git_status]
ahead = "⇡\${count}"
diverged = "⇕⇡\${ahead_count}⇣\${behind_count}"
behind = "⇣\${count}"

[nodejs]
symbol = " "

[python]
symbol = " "

[rust]
symbol = " "

[package]
symbol = " "

[docker_context]
symbol = " "

[aws]
symbol = "  "

[conda]
symbol = " "

[dart]
symbol = " "

[elixir]
symbol = " "

[elm]
symbol = " "

[golang]
symbol = " "

[haskell]
symbol = " "

[java]
symbol = " "

[julia]
symbol = " "

[kotlin]
symbol = " "

[nim]
symbol = " "

[nix_shell]
symbol = " "

[ruby]
symbol = " "

[scala]
symbol = " "
`;
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
        const expectedConfig = getStarshipConfig();
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
      const config = getStarshipConfig();
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
      return { status: 'idle', message: 'Starship not installed' };
    }
    
    const configFile = path.join(ctx.homeDir, '.config', 'starship.toml');
    try {
      await fs.access(configFile);
      return { status: 'applied', message: 'Starship configured' };
    } catch {
      return { status: 'idle', message: 'Starship config missing' };
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
