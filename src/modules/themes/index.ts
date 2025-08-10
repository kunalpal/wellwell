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

// Theme descriptions
const THEME_DESCRIPTIONS: Record<string, string> = {
  'dracula': 'Dracula theme - dark purple',
  'gruvbox-dark': 'Gruvbox dark theme',
  'solarized-dark': 'Solarized dark theme',
  'nord': 'Nord theme - arctic-inspired'
};

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
  const description = THEME_DESCRIPTIONS[name];
  if (!description) {
    return null;
  }
  
  // Load theme colors from JSON file
  const themePath = path.join(process.cwd(), 'src', 'modules', 'themes', 'resources', `${name}.json`);
  try {
    const content = await fs.readFile(themePath, 'utf-8');
    const terminalColors = JSON.parse(content);
    
    // Derive Base16 colors from terminal colors
    const colors = {
      base00: terminalColors['terminal.background'],
      base01: terminalColors['terminal.ansiBrightBlack'],
      base02: terminalColors['terminal.ansiBlack'],
      base03: terminalColors['terminal.ansiBrightBlack'],
      base04: terminalColors['terminal.ansiWhite'],
      base05: terminalColors['terminal.foreground'],
      base06: terminalColors['terminal.ansiBrightWhite'],
      base07: terminalColors['terminal.ansiBrightWhite'],
      base08: terminalColors['terminal.ansiRed'],
      base09: terminalColors['terminal.ansiYellow'],
      base0A: terminalColors['terminal.ansiBrightYellow'],
      base0B: terminalColors['terminal.ansiGreen'],
      base0C: terminalColors['terminal.ansiCyan'],
      base0D: terminalColors['terminal.ansiBlue'],
      base0E: terminalColors['terminal.ansiMagenta'],
      base0F: terminalColors['terminal.ansiBrightRed']
    };
    
    return {
      name,
      description,
      colors
    };
  } catch (error) {
    return null;
  }
}

// Generate theme-specific configurations
async function generateThemeConfigs(theme: Base16Theme): Promise<void> {
  const configDir = path.join(process.env.HOME || '', '.wellwell', 'themes', theme.name);
  await fs.mkdir(configDir, { recursive: true });

  // Generate fzf config
  const fzfConfig = generateFzfConfig(theme);
  await fs.writeFile(path.join(configDir, 'fzf.conf'), fzfConfig);

  // Generate kitty config
  const kittyConfig = generateKittyConfig(theme);
  await fs.writeFile(path.join(configDir, 'kitty.conf'), kittyConfig);

  // Generate nvim config
  const nvimConfig = generateNvimConfig(theme);
  await fs.writeFile(path.join(configDir, 'init.lua'), nvimConfig);
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
source ~/.wellwell/themes/${currentTheme}/fzf.conf`
      });

      // Store the current theme in state
      await setCurrentTheme(currentTheme, ctx);

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
        return { status: 'stale', message: `${currentTheme} theme needs generation` };
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
      ...Object.entries(THEME_DESCRIPTIONS).map(([name, description]) => `  • ${name} - ${description}`),
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
  async getAvailableThemes(): Promise<Base16Theme[]> {
    const themes: Base16Theme[] = [];
    for (const [name, description] of Object.entries(THEME_DESCRIPTIONS)) {
      const theme = await getThemeByName(name);
      if (theme) {
        themes.push(theme);
      }
    }
    return themes;
  }
};
