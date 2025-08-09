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
import { addPackageContribution } from '../../core/contrib.js';

const execAsync = promisify(exec);

async function isStarshipInstalled(): Promise<boolean> {
  try {
    await execAsync('which starship');
    return true;
  } catch {
    return false;
  }
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
  dependsOn: ['packages:homebrew', 'packages:apt', 'packages:yum'],
  priority: 55,

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    const changes = [];
    
    // Register package dependencies based on platform
    if (ctx.platform === 'macos') {
      addPackageContribution(ctx, { name: 'starship', manager: 'homebrew' });
    } else if (ctx.platform === 'ubuntu') {
      addPackageContribution(ctx, { name: 'starship', manager: 'apt' });
    } else if (ctx.platform === 'al2') {
      addPackageContribution(ctx, { name: 'starship', manager: 'yum' });
    }
    
    const isInstalled = await isStarshipInstalled();
    if (!isInstalled) {
      changes.push({ summary: 'Install starship prompt' });
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
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      const configDir = path.join(ctx.homeDir, '.config');
      const configFile = path.join(configDir, 'starship.toml');
      
      // Ensure config directory exists
      await fs.mkdir(configDir, { recursive: true });
      
      // Write starship configuration
      const config = getStarshipConfig();
      await fs.writeFile(configFile, config, 'utf8');
      
      ctx.logger.info({ file: configFile }, 'Created/updated starship configuration');
      
      return { success: true, changed: true, message: 'Starship configured' };
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
};
