import type { ConfigurationContext } from './types.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface TerminalColors {
  'terminal.background': string;
  'terminal.foreground': string;
  'terminalCursor.background': string;
  'terminalCursor.foreground': string;
  'terminal.ansiBlack': string;
  'terminal.ansiBlue': string;
  'terminal.ansiBrightBlack': string;
  'terminal.ansiBrightBlue': string;
  'terminal.ansiBrightCyan': string;
  'terminal.ansiBrightGreen': string;
  'terminal.ansiBrightMagenta': string;
  'terminal.ansiBrightRed': string;
  'terminal.ansiBrightWhite': string;
  'terminal.ansiBrightYellow': string;
  'terminal.ansiCyan': string;
  'terminal.ansiGreen': string;
  'terminal.ansiMagenta': string;
  'terminal.ansiRed': string;
  'terminal.ansiWhite': string;
  'terminal.ansiYellow': string;
}

export interface ThemeColors {
  promptColor: string;
  successColor: string;
  errorColor: string;
  // Base16 color variables derived from terminal colors
  base00: string; // Default Background
  base01: string; // Lighter Background
  base02: string; // Selection Background
  base03: string; // Comments, Invisibles
  base04: string; // Dark Foreground
  base05: string; // Default Foreground
  base06: string; // Light Foreground
  base07: string; // Light Background
  base08: string; // Variables, XML Tags
  base09: string; // Integers, Boolean
  base0A: string; // Classes, Markup Bold
  base0B: string; // Strings, Inherited Class
  base0C: string; // Support, Regular Expressions
  base0D: string; // Functions, Methods
  base0E: string; // Keywords, Storage
  base0F: string; // Deprecated
}

export class ThemeContextProvider {
  private themeCache = new Map<string, ThemeColors>();

  /**
   * Load terminal colors from JSON file
   */
  private async loadTerminalColors(themeName: string): Promise<TerminalColors> {
    const themePath = path.join(process.cwd(), 'src', 'modules', 'themes', 'resources', `${themeName}.json`);
    try {
      const content = await fs.readFile(themePath, 'utf-8');
      return JSON.parse(content) as TerminalColors;
    } catch (error) {
      throw new Error(`Failed to load theme ${themeName}: ${error}`);
    }
  }

  /**
   * Derive Base16 colors from terminal colors
   */
  private deriveBase16Colors(terminalColors: TerminalColors): ThemeColors {
    return {
      // Basic colors
      promptColor: '238',
      successColor: 'green',
      errorColor: 'red',
      
      // Base16 colors derived from terminal colors
      base00: terminalColors['terminal.background'],           // Default Background
      base01: terminalColors['terminal.ansiBrightBlack'],      // Lighter Background
      base02: terminalColors['terminal.ansiBlack'],            // Selection Background
      base03: terminalColors['terminal.ansiBrightBlack'],      // Comments, Invisibles
      base04: terminalColors['terminal.ansiWhite'],            // Dark Foreground
      base05: terminalColors['terminal.foreground'],           // Default Foreground
      base06: terminalColors['terminal.ansiBrightWhite'],      // Light Foreground
      base07: terminalColors['terminal.ansiBrightWhite'],      // Light Background
      base08: terminalColors['terminal.ansiRed'],              // Variables, XML Tags
      base09: terminalColors['terminal.ansiYellow'],           // Integers, Boolean
      base0A: terminalColors['terminal.ansiBrightYellow'],     // Classes, Markup Bold
      base0B: terminalColors['terminal.ansiGreen'],            // Strings, Inherited Class
      base0C: terminalColors['terminal.ansiCyan'],             // Support, Regular Expressions
      base0D: terminalColors['terminal.ansiBlue'],             // Functions, Methods
      base0E: terminalColors['terminal.ansiMagenta'],          // Keywords, Storage
      base0F: terminalColors['terminal.ansiBrightRed'],        // Deprecated
    };
  }

  /**
   * Get the current theme name from the context
   */
  private async getCurrentTheme(ctx: ConfigurationContext): Promise<string> {
    try {
      // Try to get the current theme from the state
      const currentTheme = ctx.state.get<string>('themes.current');
      if (currentTheme) {
        return currentTheme;
      }
    } catch {
      // Ignore errors, fall back to default
    }
    
    return 'dracula';
  }

  /**
   * Generate template context based on the current theme
   */
  async generateContext(ctx: ConfigurationContext): Promise<Record<string, string>> {
    const theme = await this.getCurrentTheme(ctx);
    const colors = await this.getThemeColors(theme);
    
    return {
      ...colors,
      themeName: theme,
    };
  }

  /**
   * Get theme colors by theme name (with caching)
   */
  async getThemeColors(themeName: string): Promise<ThemeColors> {
    // Check cache first
    if (this.themeCache.has(themeName)) {
      return this.themeCache.get(themeName)!;
    }

    // Load from JSON file and derive colors
    const terminalColors = await this.loadTerminalColors(themeName);
    const themeColors = this.deriveBase16Colors(terminalColors);
    
    // Cache the result
    this.themeCache.set(themeName, themeColors);
    
    return themeColors;
  }

  /**
   * Get available themes by scanning the themes directory
   */
  async getAvailableThemes(): Promise<string[]> {
    const themesDir = path.join(process.cwd(), 'src', 'modules', 'themes', 'resources');
    try {
      const files = await fs.readdir(themesDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch {
      return [];
    }
  }

  /**
   * Check if a theme exists
   */
  async hasTheme(themeName: string): Promise<boolean> {
    const themePath = path.join(process.cwd(), 'src', 'modules', 'themes', 'resources', `${themeName}.json`);
    try {
      await fs.access(themePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear the theme cache
   */
  clearCache(): void {
    this.themeCache.clear();
  }
}

// Export a singleton instance
export const themeContextProvider = new ThemeContextProvider();
