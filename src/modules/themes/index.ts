import type {
  ConfigurationModule,
  ConfigurationContext,
  PlanResult,
  ApplyResult,
  StatusResult,
} from '../../core/types';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { addShellInitContribution } from '../../core/contrib.js';

// Theme interface
interface Base16Theme {
  name: string;
  description: string;
  colors: {
    base00: string; // Default Background
    base01: string; // Lighter Background (Used for status bars, line number and folding marks)
    base02: string; // Selection Background
    base03: string; // Comments, Invisibles, Line Highlighting
    base04: string; // Dark Foreground (Used for status bars)
    base05: string; // Default Foreground, Caret, Delimiters, Operators
    base06: string; // Light Foreground (Not often used)
    base07: string; // Light Background (Not often used)
    base08: string; // Variables, XML Tags, Markup Link Text, Markup Lists, Diff Deleted
    base09: string; // Integers, Boolean, Constants, XML Attributes, Markup Link Url
    base0A: string; // Classes, Markup Bold, Search Text Background
    base0B: string; // Strings, Inherited Class, Markup Code, Diff Inserted
    base0C: string; // Support, Regular Expressions, Escape Characters, Markup Quotes
    base0D: string; // Functions, Methods, Attribute IDs, Headings
    base0E: string; // Keywords, Storage, Selector, Markup Italic, Diff Changed
    base0F: string; // Deprecated, Opening/Closing Embedded Language Tags, e.g. <?php ?>
  };
}

// Available themes
const AVAILABLE_THEMES: Base16Theme[] = [
  {
    name: 'dracula',
    description: 'Dracula theme - dark purple',
    colors: {
      base00: '#282936',
      base01: '#3a3c4e',
      base02: '#4d4f68',
      base03: '#626483',
      base04: '#62d6e8',
      base05: '#e9e9f4',
      base06: '#f1f2f8',
      base07: '#f7f7fb',
      base08: '#ea51b2',
      base09: '#b45bcf',
      base0A: '#00f769',
      base0B: '#ebff87',
      base0C: '#a1efe4',
      base0D: '#62d6e8',
      base0E: '#b45bcf',
      base0F: '#00f769'
    }
  },
  {
    name: 'gruvbox-dark',
    description: 'Gruvbox dark theme',
    colors: {
      base00: '#282828',
      base01: '#3c3836',
      base02: '#504945',
      base03: '#665c54',
      base04: '#bdae93',
      base05: '#d5c4a1',
      base06: '#ebdbb2',
      base07: '#fbf1c7',
      base08: '#fb4934',
      base09: '#fe8019',
      base0A: '#fabd2f',
      base0B: '#b8bb26',
      base0C: '#8ec07c',
      base0D: '#83a598',
      base0E: '#d3869b',
      base0F: '#d65d0e'
    }
  },
  {
    name: 'solarized-dark',
    description: 'Solarized dark theme',
    colors: {
      base00: '#002b36',
      base01: '#073642',
      base02: '#586e75',
      base03: '#657b83',
      base04: '#839496',
      base05: '#93a1a1',
      base06: '#eee8d5',
      base07: '#fdf6e3',
      base08: '#dc322f',
      base09: '#cb4b16',
      base0A: '#b58900',
      base0B: '#859900',
      base0C: '#2aa198',
      base0D: '#268bd2',
      base0E: '#6c71c4',
      base0F: '#d33682'
    }
  },
  {
    name: 'nord',
    description: 'Nord theme - arctic-inspired',
    colors: {
      base00: '#2e3440',
      base01: '#3b4252',
      base02: '#434c5e',
      base03: '#4c566a',
      base04: '#d8dee9',
      base05: '#e5e9f0',
      base06: '#eceff4',
      base07: '#8fbcbb',
      base08: '#bf616a',
      base09: '#d08770',
      base0A: '#ebcb8b',
      base0B: '#a3be8c',
      base0C: '#88c0d0',
      base0D: '#81a1c1',
      base0E: '#b48ead',
      base0F: '#5e81ac'
    }
  }
];

// Theme state management
const THEME_STATE_KEY = 'themes.current';

async function getCurrentTheme(ctx?: ConfigurationContext): Promise<string> {
  if (ctx) {
    return ctx.state.get<string>(THEME_STATE_KEY) || 'dracula';
  }
  // Fallback for when context is not available
  return 'dracula';
}

async function setCurrentTheme(themeName: string, ctx?: ConfigurationContext): Promise<void> {
  if (ctx) {
    ctx.state.set(THEME_STATE_KEY, themeName);
  }
  console.log(`Theme switched to: ${themeName}`);
}

async function getThemeByName(name: string): Promise<Base16Theme | null> {
  return AVAILABLE_THEMES.find(theme => theme.name === name) || null;
}

// Generate theme-specific configurations
async function generateThemeConfigs(theme: Base16Theme): Promise<void> {
  const configs = {
    fzf: generateFzfConfig(theme),
    starship: generateStarshipConfig(theme),
    kitty: generateKittyConfig(theme),
    nvim: generateNvimConfig(theme)
  };

  // Write configs to appropriate locations
  const configDir = path.join(process.env.HOME || '', '.wellwell', 'themes', theme.name);
  await fs.mkdir(configDir, { recursive: true });

  for (const [name, config] of Object.entries(configs)) {
    await fs.writeFile(path.join(configDir, `${name}.conf`), config);
  }
}

function generateFzfConfig(theme: Base16Theme): string {
  return `export FZF_DEFAULT_OPTS=$FZF_DEFAULT_OPTS'
  --color=fg:${theme.colors.base05},fg+:${theme.colors.base07},bg:${theme.colors.base00},bg+:${theme.colors.base02}
  --color=hl:${theme.colors.base0D},hl+:${theme.colors.base0C},info:${theme.colors.base0A},marker:${theme.colors.base0B}
  --color=prompt:${theme.colors.base08},spinner:${theme.colors.base0E},pointer:${theme.colors.base0D},header:${theme.colors.base0C}
  --color=border:${theme.colors.base02},label:${theme.colors.base04},query:${theme.colors.base05}
  --border="rounded" --border-label="" --preview-window="border-rounded" --prompt="❯ "
  --marker="◆" --pointer="◆" --separator="" --scrollbar="│"
  --layout="reverse" --info="right"'`;
}

function generateStarshipConfig(theme: Base16Theme): string {
  return `[character]
success_symbol = "[➜](bold ${theme.colors.base0B})"
error_symbol = "[✗](bold ${theme.colors.base08})"

[directory]
style = "bold ${theme.colors.base0D}"

[git_branch]
symbol = " "
style = "bold ${theme.colors.base0E}"

[git_status]
style = "bold ${theme.colors.base0A}"

[package]
style = "bold ${theme.colors.base09}"

[nodejs]
style = "bold ${theme.colors.base0B}"

[python]
style = "bold ${theme.colors.base0C}"

[cmd_duration]
style = "bold ${theme.colors.base0A}"

[line_break]
disabled = true`;
}

function generateKittyConfig(theme: Base16Theme): string {
  return `# Kitty Configuration by wellwell - ${theme.name} theme
background ${theme.colors.base00}
foreground ${theme.colors.base05}
selection_background ${theme.colors.base02}
selection_foreground ${theme.colors.base05}
url_color ${theme.colors.base0D}
cursor ${theme.colors.base05}
cursor_text_color ${theme.colors.base00}

# Normal colors
color0 ${theme.colors.base00}
color1 ${theme.colors.base08}
color2 ${theme.colors.base0B}
color3 ${theme.colors.base0A}
color4 ${theme.colors.base0D}
color5 ${theme.colors.base0E}
color6 ${theme.colors.base0C}
color7 ${theme.colors.base05}

# Bright colors
color8 ${theme.colors.base03}
color9 ${theme.colors.base08}
color10 ${theme.colors.base0B}
color11 ${theme.colors.base0A}
color12 ${theme.colors.base0D}
color13 ${theme.colors.base0E}
color14 ${theme.colors.base0C}
color15 ${theme.colors.base07}

# Font
font_family Source Code Pro
font_size 12.0`;
}

function generateNvimConfig(theme: Base16Theme): string {
  return `-- Neovim configuration by wellwell - ${theme.name} theme
vim.cmd([[
  set background=dark
  colorscheme base16-${theme.name}
]])

-- Set colors for specific highlights
vim.api.nvim_set_hl(0, "Normal", { bg = "${theme.colors.base00}", fg = "${theme.colors.base05}" })
vim.api.nvim_set_hl(0, "Comment", { fg = "${theme.colors.base03}" })
vim.api.nvim_set_hl(0, "String", { fg = "${theme.colors.base0B}" })
vim.api.nvim_set_hl(0, "Number", { fg = "${theme.colors.base09}" })
vim.api.nvim_set_hl(0, "Keyword", { fg = "${theme.colors.base0E}" })
vim.api.nvim_set_hl(0, "Function", { fg = "${theme.colors.base0D}" })
vim.api.nvim_set_hl(0, "Type", { fg = "${theme.colors.base0A}" })`;
}

export const themesModule: ConfigurationModule = {
  id: 'themes:base16',
  description: 'Base16 color scheme management',
  priority: 5,
  dependsOn: [],

  async isApplicable(ctx) {
    return true; // Available on all platforms
  },

  async plan(ctx): Promise<PlanResult> {
    const changes = [];
    const currentTheme = await getCurrentTheme(ctx);
    
    // Check if theme configs need to be generated
    const theme = await getThemeByName(currentTheme);
    if (theme) {
      const configDir = path.join(process.env.HOME || '', '.wellwell', 'themes', currentTheme);
      try {
        await fs.access(configDir);
      } catch {
        changes.push({ summary: `Generate ${currentTheme} theme configurations` });
      }
    }

    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      const currentTheme = await getCurrentTheme(ctx);
      const theme = await getThemeByName(currentTheme);
      
      if (!theme) {
        return { success: false, error: new Error(`Theme ${currentTheme} not found`) };
      }

      await generateThemeConfigs(theme);
      
      // Add shell init contribution to source theme configs
      addShellInitContribution(ctx, {
        name: 'theme',
        initCode: `# Source theme configurations
export WELLWELL_THEME="${currentTheme}"
source ~/.wellwell/themes/${currentTheme}/fzf.conf
source ~/.wellwell/themes/${currentTheme}/starship.conf`
      });

      return { 
        success: true, 
        changed: true, 
        message: `Applied ${currentTheme} theme` 
      };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    try {
      const currentTheme = await getCurrentTheme(ctx);
      const theme = await getThemeByName(currentTheme);
      
      if (!theme) {
        return { status: 'failed', message: `Theme ${currentTheme} not found` };
      }

      const configDir = path.join(process.env.HOME || '', '.wellwell', 'themes', currentTheme);
      try {
        await fs.access(configDir);
        return { status: 'applied', message: `${currentTheme} theme active` };
      } catch {
        return { status: 'idle', message: `${currentTheme} theme needs generation` };
      }
    } catch (error) {
      return { status: 'failed', message: `Error checking theme status: ${error}` };
    }
  },

  getDetails(ctx): string[] {
    return [
      'Base16 Color Scheme Management',
      '',
      'Available themes:',
      ...AVAILABLE_THEMES.map(theme => `  • ${theme.name} - ${theme.description}`),
      '',
      'Press TAB to cycle through themes',
      'Dependent modules will be marked for re-apply when theme changes'
    ];
  },

  // Custom method for theme switching
  async switchTheme(themeName: string, ctx?: ConfigurationContext): Promise<boolean> {
    const theme = await getThemeByName(themeName);
    if (!theme) {
      return false;
    }

    await setCurrentTheme(themeName, ctx);
    return true;
  },

  // Get available themes for UI
  getAvailableThemes(): Base16Theme[] {
    return AVAILABLE_THEMES;
  }
};
