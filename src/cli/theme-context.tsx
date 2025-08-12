import React, { createContext, useContext, useEffect, useState } from 'react';
import { themeContextProvider, type ThemeColors } from '../core/theme-context.js';
import type { ConfigurationContext } from '../core/types.js';

interface ThemeContextValue {
  currentTheme: string;
  themeColors: ThemeColors | null;
  isLoading: boolean;
  switchTheme: (themeName: string, ctx: ConfigurationContext) => Promise<void>;
  getAvailableThemes: () => Promise<string[]>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  initialTheme?: string;
  engineContext: ConfigurationContext;
}

export function ThemeProvider({ children, initialTheme = 'dracula', engineContext }: ThemeProviderProps) {
  const [currentTheme, setCurrentTheme] = useState(initialTheme);
  const [themeColors, setThemeColors] = useState<ThemeColors | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load theme colors
  useEffect(() => {
    async function loadThemeColors() {
      try {
        setIsLoading(true);
        const colors = await themeContextProvider.getThemeColors(currentTheme);
        setThemeColors(colors);
      } catch (error) {
        console.error('Failed to load theme colors:', error);
        // Fallback to default colors
        setThemeColors({
          base00: '#282828',
          base01: '#3c3836',
          base02: '#504945',
          base03: '#665c54',
          base04: '#7c6f64',
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
          base0F: '#d65d0e',
        });
      } finally {
        setIsLoading(false);
      }
    }

    void loadThemeColors();
  }, [currentTheme]);

  const switchTheme = async (themeName: string, ctx: ConfigurationContext) => {
    try {
      // Update the theme in the engine's state
      ctx.state.set('themes.current', themeName);
      setCurrentTheme(themeName);
      
      // Clear the theme cache to force reload
      themeContextProvider.clearCache();
    } catch (error) {
      console.error('Failed to switch theme:', error);
    }
  };

  const getAvailableThemes = async (): Promise<string[]> => {
    try {
      return await themeContextProvider.getAvailableThemes();
    } catch (error) {
      console.error('Failed to get available themes:', error);
      return ['dracula', 'gruvbox-dark', 'nord', 'solarized-dark'];
    }
  };

  const value: ThemeContextValue = {
    currentTheme,
    themeColors,
    isLoading,
    switchTheme,
    getAvailableThemes,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
