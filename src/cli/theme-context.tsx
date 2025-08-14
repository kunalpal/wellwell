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

export function ThemeProvider({ children, initialTheme = 'default', engineContext }: ThemeProviderProps) {
  const [currentTheme, setCurrentTheme] = useState(initialTheme);
  const [themeColors, setThemeColors] = useState<ThemeColors | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize theme and load colors in a single effect to avoid race conditions
  useEffect(() => {
    async function initializeThemeAndColors() {
      try {
        setIsLoading(true);
        
        // Try to get the current theme from the engine's state
        let savedTheme = initialTheme;
        try {
          const savedThemeFromState = engineContext.state.get<string>('themes.current');
          if (savedThemeFromState) {
            savedTheme = savedThemeFromState;
          }
        } catch (stateError) {
          // If state read fails, try to read from the state file directly
          try {
            const { readFile } = await import('node:fs/promises');
            const { join } = await import('node:path');
            const { homedir } = await import('node:os');
            const statePath = join(homedir(), '.wellwell', 'state.json');
            const stateContent = await readFile(statePath, 'utf-8');
            const state = JSON.parse(stateContent);
            savedTheme = state.themes?.current || initialTheme;
          } catch (fileError) {
            // Fallback to initialTheme if all else fails
            savedTheme = initialTheme;
          }
        }
        
        // Set the theme first
        setCurrentTheme(savedTheme);
        
        // Then load the colors for the correct theme
        const colors = await themeContextProvider.getThemeColors(savedTheme);
        setThemeColors(colors);
      } catch (error) {
        console.error('Failed to initialize theme and colors:', error);
        setCurrentTheme(initialTheme);
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

    void initializeThemeAndColors();
  }, [engineContext, initialTheme]);

  const switchTheme = async (themeName: string, ctx: ConfigurationContext) => {
    try {
      setIsLoading(true);
      
      // Update the theme in the engine's state
      ctx.state.set('themes.current', themeName);
      
      // Clear the theme cache to force reload
      themeContextProvider.clearCache();
      
      // Update the theme and load new colors atomically
      setCurrentTheme(themeName);
      const colors = await themeContextProvider.getThemeColors(themeName);
      setThemeColors(colors);
    } catch (error) {
      console.error('Failed to switch theme:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getAvailableThemes = async (): Promise<string[]> => {
    try {
      return await themeContextProvider.getAvailableThemes();
    } catch (error) {
      console.error('Failed to get available themes:', error);
      return ['default', 'gruvbox-dark', 'nord', 'tomorrow-night', 'seti'];
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
