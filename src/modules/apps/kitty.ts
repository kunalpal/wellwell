import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { AppConfig, type AppConfigOptions } from '../../core/app-config.js';
import type { ConfigurationContext, Platform } from '../../core/types.js';

const execAsync = promisify(exec);

class KittyConfig extends AppConfig {
  protected template = (ctx: ConfigurationContext, themeColors?: any): string => {
    const currentTheme = ctx.state.get<string>('themes.current') || 'dracula';
    
    let config = `# Kitty Configuration by wellwell
# Font configuration
font_family      Cascadia Code PL
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

    if (themeColors) {
      // Replace the hardcoded colors with theme colors
      config = config.replace(/#c0caf5/g, themeColors.base05); // foreground
      config = config.replace(/#1a1b26/g, themeColors.base00); // background
      config = config.replace(/#33467c/g, themeColors.base02); // selection_background
      config = config.replace(/#15161e/g, themeColors.base00); // color0
      config = config.replace(/#414868/g, themeColors.base03); // color8
      config = config.replace(/#f7768e/g, themeColors.base08); // color1/9 (red)
      config = config.replace(/#9ece6a/g, themeColors.base0B); // color2/10 (green)
      config = config.replace(/#e0af68/g, themeColors.base0A); // color3/11 (yellow)
      config = config.replace(/#7aa2f7/g, themeColors.base0D); // color4/12 (blue)
      config = config.replace(/#bb9af7/g, themeColors.base0E); // color5/13 (magenta)
      config = config.replace(/#7dcfff/g, themeColors.base0C); // color6/14 (cyan)
      config = config.replace(/#a9b1d6/g, themeColors.base05); // color7
      config = config.replace(/#73daca/g, themeColors.base0D); // url_color
    }

    return config;
  };

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
      template: (ctx: ConfigurationContext, themeColors?: any): string => {
        const currentTheme = ctx.state.get<string>('themes.current') || 'dracula';
        
        let config = `# Kitty Configuration by wellwell
# Font configuration
font_family      Cascadia Code PL
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

        if (themeColors) {
          // Replace the hardcoded colors with theme colors
          config = config.replace(/#c0caf5/g, themeColors.base05); // foreground
          config = config.replace(/#1a1b26/g, themeColors.base00); // background
          config = config.replace(/#33467c/g, themeColors.base02); // selection_background
          config = config.replace(/#15161e/g, themeColors.base00); // color0
          config = config.replace(/#414868/g, themeColors.base03); // color8
          config = config.replace(/#f7768e/g, themeColors.base08); // color1/9 (red)
          config = config.replace(/#9ece6a/g, themeColors.base0B); // color2/10 (green)
          config = config.replace(/#e0af68/g, themeColors.base0A); // color3/11 (yellow)
          config = config.replace(/#7aa2f7/g, themeColors.base0D); // color4/12 (blue)
          config = config.replace(/#bb9af7/g, themeColors.base0E); // color5/13 (magenta)
          config = config.replace(/#7dcfff/g, themeColors.base0C); // color6/14 (cyan)
          config = config.replace(/#a9b1d6/g, themeColors.base05); // color7
          config = config.replace(/#73daca/g, themeColors.base0D); // url_color
        }

        return config;
      },
    });
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

      // Use the base class apply method for configuration
      const result = await super.apply(ctx);
      
      if (result.success) {
        return {
          success: true,
          changed: true,
          message: `${installMessage} and ${result.message}`,
        };
      }
      
      return result;
    } catch (error) {
      return this.createErrorResult(error);
    }
  }

  async status(ctx: ConfigurationContext): Promise<any> {
    try {
      // Check if Kitty is installed
      await execAsync('which kitty');
      
      // Check if config exists
      const exists = await this.configExists(ctx);
      if (!exists) {
        return { status: 'stale', message: 'Kitty config missing' };
      }
      
      return { status: 'applied', message: 'Kitty installed and configured' };
    } catch {
      return { status: 'stale', message: 'Kitty not installed' };
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
