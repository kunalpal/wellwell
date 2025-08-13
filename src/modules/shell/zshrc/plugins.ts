import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
  PlanChange,
} from '../../../core/types.js';
import { templateManager } from '../../../core/template-manager.js';

const execAsync = promisify(exec);

const ZSHRC_PLUGINS_MARKER_START = '# === wellwell:plugins:begin ===';
const ZSHRC_PLUGINS_MARKER_END = '# === wellwell:plugins:end ===';

interface ZshPlugin {
  name: string;
  repo: string;
  description: string;
}

const DEFAULT_PLUGINS: ZshPlugin[] = [
  {
    name: 'zsh-autosuggestions',
    repo: 'zsh-users/zsh-autosuggestions',
    description: 'Fish-like autosuggestions for zsh',
  },
  {
    name: 'zsh-syntax-highlighting',
    repo: 'zsh-users/zsh-syntax-highlighting',
    description: 'Fish shell like syntax highlighting for zsh',
  },
];

async function isZinitInstalled(homeDir: string): Promise<boolean> {
  try {
    const zinitDir = path.join(homeDir, '.local', 'share', 'zinit', 'zinit.git');
    await fs.access(zinitDir);
    return true;
  } catch {
    return false;
  }
}

async function installZinit(homeDir: string): Promise<void> {
  const zinitDir = path.join(homeDir, '.local', 'share', 'zinit');
  await fs.mkdir(zinitDir, { recursive: true });
  
  const installScript = `bash -c "$(curl --fail --show-error --silent --location https://raw.githubusercontent.com/zdharma-continuum/zinit/HEAD/scripts/install.sh)"`;
  await execAsync(installScript, { 
    env: { ...process.env, ZINIT_HOME: zinitDir }
  });
}

async function generatePluginsConfig(): Promise<string> {
  // Load module partials
  await templateManager.loadModulePartials('shell');
  
  // Generate context with plugins
  const context = {
    plugins: DEFAULT_PLUGINS,
  };
  
  // Load and render the template
  return templateManager.loadAndRender('shell', 'zshrc-plugins.zsh.hbs', context);
}

async function updateZshrcPlugins(filePath: string): Promise<{ changed: boolean }> {
  const newBlock = await generatePluginsConfig();
  
  // Ensure target file exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    // File doesn't exist, create it
    await fs.writeFile(filePath, '', 'utf8');
    content = '';
  }
  
  // Find and replace the plugins block
  const startIdx = content.indexOf(ZSHRC_PLUGINS_MARKER_START);
  const endIdx = content.indexOf(ZSHRC_PLUGINS_MARKER_END);
  
  let updated: string;
  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing block
    const before = content.substring(0, startIdx);
    const after = content.substring(endIdx + ZSHRC_PLUGINS_MARKER_END.length);
    updated = before + newBlock + after;
  } else {
    // Append new block
    updated = content + (content.endsWith('\n') ? '' : '\n') + newBlock;
  }
  
  const changed = updated !== content;
  if (changed) await fs.writeFile(filePath, updated);
  return { changed };
}

export const zshrcPluginsModule: ConfigurationModule = {
  id: 'shell:zshrc:plugins',
  description: 'Configure zsh plugins with zinit (autosuggestions, syntax-highlighting)',
  dependsOn: ['shell:zshrc:base'],
  priority: 60,

  async isApplicable(ctx) {
    return ctx.platform !== 'unknown';
  },

  async plan(ctx): Promise<PlanResult> {
    const changes: PlanChange[] = [];
    
    const zinitInstalled = await isZinitInstalled(ctx.homeDir);
    if (!zinitInstalled) {
      changes.push({ summary: 'Install zinit zsh plugin manager' });
    }
    
    const zshrcPath = path.join(ctx.homeDir, '.zshrc');
    try {
      const content = await fs.readFile(zshrcPath, 'utf8');
      const hasPluginsBlock = content.includes(ZSHRC_PLUGINS_MARKER_START);
      if (!hasPluginsBlock) {
        changes.push({ 
          summary: `Add zinit configuration and ${DEFAULT_PLUGINS.length} plugins to ~/.zshrc`
        });
      } else {
        // Check if the current block matches what we want
        const newBlock = await generatePluginsConfig();
        const startIdx = content.indexOf(ZSHRC_PLUGINS_MARKER_START);
        const endIdx = content.indexOf(ZSHRC_PLUGINS_MARKER_END);
        if (startIdx !== -1 && endIdx !== -1) {
          const currentBlock = content.substring(startIdx, endIdx + ZSHRC_PLUGINS_MARKER_END.length);
          if (currentBlock !== newBlock.trim()) {
            changes.push({ summary: 'Update zsh plugins configuration' });
          }
        }
      }
    } catch {
      changes.push({ 
        summary: `Add zinit configuration and ${DEFAULT_PLUGINS.length} plugins to ~/.zshrc`
      });
    }
    
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      let changed = false;
      
      // Install zinit if not present
      const zinitInstalled = await isZinitInstalled(ctx.homeDir);
      if (!zinitInstalled) {
        await installZinit(ctx.homeDir);
        changed = true;
      }
      
      // Update zshrc with plugins configuration
      const zshrcPath = path.join(ctx.homeDir, '.zshrc');
      const result = await updateZshrcPlugins(zshrcPath);
      if (result.changed) {
        changed = true;
      }
      
      const message = changed 
        ? `Configured zinit with ${DEFAULT_PLUGINS.length} plugins`
        : 'Zsh plugins already configured';
        
      return { success: true, changed, message };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    try {
      // Check if zinit is installed
      const zinitInstalled = await isZinitInstalled(ctx.homeDir);
      if (!zinitInstalled) {
        return { status: 'stale', message: 'Zinit not installed' };
      }
      
      // Check if plugins are configured in zshrc
      const zshrcPath = path.join(ctx.homeDir, '.zshrc');
      try {
        const content = await fs.readFile(zshrcPath, 'utf8');
        const hasPluginsBlock = content.includes(ZSHRC_PLUGINS_MARKER_START);
        if (hasPluginsBlock) {
          return { status: 'applied', message: `Zinit configured with ${DEFAULT_PLUGINS.length} plugins` };
        } else {
          return { status: 'stale', message: 'Plugins not configured in zshrc' };
        }
      } catch {
        return { status: 'stale', message: 'Zshrc not found' };
      }
    } catch (error) {
      return { status: 'failed', message: `Error checking status: ${error}` };
    }
  },

  getDetails(_ctx): string[] {
    return [
      'Zsh plugins via zinit:',
      '  • zsh-autosuggestions (Fish-like autosuggestions)',
      '  • zsh-syntax-highlighting (Command syntax highlighting)',
    ];
  },
};


