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
  PlanChange,
} from '../../core/types.js';
import { addPackageContribution, addShellInitContribution } from '../../core/contrib.js';

const execAsync = promisify(exec);

const KITTY_CONFIG = `# Kitty Configuration by wellwell
# Font configuration
font_family      Source Code Pro
font_size        12.0
adjust_line_height  0
adjust_column_width 0

# Window layout
remember_window_size  yes
initial_window_width  1200
initial_window_height 800
window_padding_width  4

# Tab bar
tab_bar_edge            top
tab_bar_style           powerline
tab_powerline_style     slanted
tab_title_template      {title}{' :{}:'.format(num_windows) if num_windows > 1 else ''}

# Color scheme (based on Tokyo Night)
foreground            #c0caf5
background            #1a1b26
selection_foreground  #c0caf5
selection_background  #33467c

# Black
color0   #15161e
color8   #414868

# Red
color1   #f7768e
color9   #f7768e

# Green
color2   #9ece6a
color10  #9ece6a

# Yellow
color3   #e0af68
color11  #e0af68

# Blue
color4   #7aa2f7
color12  #7aa2f7

# Magenta
color5   #bb9af7
color13  #bb9af7

# Cyan
color6   #7dcfff
color14  #7dcfff

# White
color7   #a9b1d6
color15  #c0caf5

# Cursor colors
cursor            #c0caf5
cursor_text_color #1a1b26

# URL underline color when hovering with mouse
url_color #73daca

# Performance tuning
repaint_delay   10
input_delay     3
sync_to_monitor yes

# macOS specific
macos_option_as_alt yes
macos_quit_when_last_window_closed yes
macos_window_resizable yes
macos_traditional_fullscreen no

# Key mappings
map cmd+c copy_to_clipboard
map cmd+v paste_from_clipboard
map cmd+t new_tab
map cmd+w close_tab
map cmd+shift+] next_tab
map cmd+shift+[ previous_tab
map cmd+plus change_font_size all +2.0
map cmd+minus change_font_size all -2.0
map cmd+0 change_font_size all 0
`;

async function isKittyInstalled(): Promise<boolean> {
  try {
    // First check if kitty command is available
    await execAsync('which kitty');
    return true;
  } catch {
    // Check if it's installed via Homebrew cask
    try {
      const { stdout } = await execAsync('brew list --cask kitty 2>/dev/null');
      return stdout.trim().length > 0;
    } catch {
      // Check if Kitty.app exists in Applications folder
      try {
        await fs.access('/Applications/kitty.app');
        return true;
      } catch {
        return false;
      }
    }
  }
}

async function getKittyConfigPath(homeDir: string): Promise<string> {
  return path.join(homeDir, '.config', 'kitty', 'kitty.conf');
}

async function hasKittyConfig(configPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(configPath, 'utf8');
    // Check if it contains our wellwell configuration marker
    return content.includes('# Kitty Configuration by wellwell');
  } catch {
    return false;
  }
}

async function createKittyConfig(configPath: string): Promise<void> {
  const configDir = path.dirname(configPath);
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, KITTY_CONFIG, 'utf8');
}

export const kittyModule: ConfigurationModule = {
  id: 'apps:kitty',
  description: 'Kitty terminal emulator with custom configuration (macOS only)',
  dependsOn: ['packages:homebrew'],
  priority: 65,

  async isApplicable(ctx) {
    return ctx.platform === 'macos';
  },

  async plan(ctx): Promise<PlanResult> {
    const changes: PlanChange[] = [];
    
    // Add package contribution for Homebrew cask
    addPackageContribution(ctx, {
      name: 'kitty',
      manager: 'homebrew',
      platforms: ['macos'],
    });
    
    const isInstalled = await isKittyInstalled();
    if (!isInstalled) {
      changes.push({ summary: 'Install Kitty terminal emulator via Homebrew' });
    }
    
    const configPath = await getKittyConfigPath(ctx.homeDir);
    const hasConfig = await hasKittyConfig(configPath);
    if (!hasConfig) {
      changes.push({ summary: 'Create Kitty configuration with Tokyo Night theme' });
    }
    
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      let changed = false;
      let installMessage = '';
      
      // Check if Kitty is installed
      const isInstalled = await isKittyInstalled();
      if (!isInstalled) {
        ctx.logger.info('Installing Kitty via Homebrew...');
        try {
          await execAsync('brew install --cask kitty');
          changed = true;
          installMessage = 'Kitty installed';
        } catch (error) {
          // If Homebrew installation fails, check if it's because it's already installed
          const stillNotInstalled = !(await isKittyInstalled());
          if (stillNotInstalled) {
            throw error; // Re-throw if it's actually not installed
          }
          // If it's now detected as installed, continue without error
          installMessage = 'Kitty detected (already installed)';
        }
      } else {
        installMessage = 'Kitty already installed';
      }
      


      // Create/update configuration (always ensure our config is in place)
      const configPath = await getKittyConfigPath(ctx.homeDir);
      const hasConfig = await hasKittyConfig(configPath);
      await createKittyConfig(configPath);
      changed = true;
      installMessage += hasConfig ? ' and configuration updated' : ' and configured';
      
      return { success: true, changed, message: installMessage };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const isInstalled = await isKittyInstalled();
    if (!isInstalled) {
      return { status: 'idle', message: 'Kitty not installed' };
    }
    
    const configPath = await getKittyConfigPath(ctx.homeDir);
    const hasConfig = await hasKittyConfig(configPath);
    if (!hasConfig) {
      return { status: 'idle', message: 'Kitty config missing' };
    }
    
    return { status: 'applied', message: 'Kitty installed and configured' };
  },

  getDetails(_ctx): string[] {
    return [
      'Modern GPU-accelerated terminal:',
      '  • Tokyo Night color scheme',
      '  • SF Mono font with optimized settings',
      '  • Powerline tab bar with slanted style',
      '  • macOS-specific optimizations',
      '  • Custom key mappings (cmd+c/v, tab navigation)',
      '  • Performance-tuned rendering',
    ];
  },
};
