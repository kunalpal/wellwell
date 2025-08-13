import type {
  ConfigurationModule,
  ConfigurationContext,
  PlanResult,
  ModuleResult,
  StatusResult,
} from '../../core/types.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { addShellInitContribution } from '../../core/contrib.js';
import { getProjectRoot } from '../../core/module-helpers.js';

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

// Theme descriptions - will be populated dynamically
let THEME_DESCRIPTIONS: Record<string, string> = {};

// Initialize theme descriptions from available theme files
async function initializeThemeDescriptions(): Promise<void> {
  const projectRoot = getProjectRoot();
  const themesDir = path.join(projectRoot, 'src', 'modules', 'themes', 'resources');
  try {
    const files = await fs.readdir(themesDir);
    const themeFiles = files.filter(file => file.endsWith('.json'));
    
    THEME_DESCRIPTIONS = {};
    for (const file of themeFiles) {
      const themeName = file.replace('.json', '');
      THEME_DESCRIPTIONS[themeName] = themeName; // Just use the name as description
    }
  } catch (error) {
    // Fallback to empty object if directory doesn't exist
    THEME_DESCRIPTIONS = {};
  }
}

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
}

async function getThemeByName(name: string): Promise<Base16Theme | null> {
  // Load theme colors from JSON file
  const projectRoot = getProjectRoot();
  const themePath = path.join(projectRoot, 'src', 'modules', 'themes', 'resources', `${name}.json`);
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
      description: name, // Use name as description
      colors
    };
  } catch (error) {
    return null;
  }
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
    
    // Check if theme is available
    const theme = await getThemeByName(currentTheme);
    if (!theme) {
      changes.push({ summary: `Theme ${currentTheme} not found` });
    }

    return { changes };
  },

  async apply(ctx): Promise<ModuleResult> {
    try {
      const currentTheme = await getCurrentTheme(ctx);
      const theme = await getThemeByName(currentTheme);
      
      if (!theme) {
        return { success: false, error: new Error(`Theme ${currentTheme} not found`) };
      }

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

      return { status: 'applied', message: `${currentTheme} theme available` };
    } catch (error) {
      return { status: 'failed', message: `Error checking theme status: ${error}` };
    }
  },

  async getDetails(ctx): Promise<string[]> {
    const currentTheme = await getCurrentTheme(ctx);
    
    // Initialize theme descriptions if not already done
    if (Object.keys(THEME_DESCRIPTIONS).length === 0) {
      await initializeThemeDescriptions();
    }
    
    return [
      'Base16 Color Scheme Management',
      '',
      `Current theme: ${currentTheme}`,
      '',
      'Available themes:',
      ...Object.entries(THEME_DESCRIPTIONS).map(([name, description]) => {
        const marker = name === currentTheme ? '  ❯ ' : '  - ';
        return `${marker}${name}`;
      }),
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
    // Initialize theme descriptions if not already done
    if (Object.keys(THEME_DESCRIPTIONS).length === 0) {
      await initializeThemeDescriptions();
    }
    
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
