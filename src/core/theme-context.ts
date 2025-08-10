import type { ConfigurationContext } from './types';

export interface ThemeColors {
  promptColor: string;
  successColor: string;
  errorColor: string;
  // Base16 color variables
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
  private readonly THEME_COLORS: Record<string, ThemeColors> = {
    'dracula': {
      promptColor: '238',
      successColor: 'green',
      errorColor: 'red',
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
    },
    'gruvbox-dark': {
      promptColor: '238',
      successColor: 'green',
      errorColor: 'red',
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
    },
    'solarized-dark': {
      promptColor: '238',
      successColor: 'green',
      errorColor: 'red',
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
    },
    'nord': {
      promptColor: '238',
      successColor: 'green',
      errorColor: 'red',
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
    },
    // Default theme
    'default': {
      promptColor: '238',
      successColor: 'green',
      errorColor: 'red',
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
    },
  };

  /**
   * Get the current theme name from the context
   */
  private async getCurrentTheme(ctx: ConfigurationContext): Promise<string> {
    try {
      // Try to get the current theme from the state
      const currentTheme = ctx.state.get<string>('current_theme');
      if (currentTheme && this.THEME_COLORS[currentTheme]) {
        return currentTheme;
      }
    } catch {
      // Ignore errors, fall back to default
    }
    
    return 'default';
  }

  /**
   * Generate template context based on the current theme
   */
  async generateContext(ctx: ConfigurationContext): Promise<Record<string, string>> {
    const theme = await this.getCurrentTheme(ctx);
    const colors = this.THEME_COLORS[theme] || this.THEME_COLORS.default;
    
    return {
      ...colors,
      // Add any other context variables here
      themeName: theme,
    };
  }

  /**
   * Get available themes
   */
  getAvailableThemes(): string[] {
    return Object.keys(this.THEME_COLORS).filter(theme => theme !== 'default');
  }

  /**
   * Check if a theme exists
   */
  hasTheme(themeName: string): boolean {
    return themeName in this.THEME_COLORS;
  }
}

// Export a singleton instance
export const themeContextProvider = new ThemeContextProvider();
