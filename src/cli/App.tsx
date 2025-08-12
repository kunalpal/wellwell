import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import chalk from 'chalk';

import { Engine } from '../core/engine.js';
import { allModules } from '../modules/index.js';
import { formatStatus } from './status-format.js';
import { ThemeProvider } from './theme-context.js';
import Dashboard from './Dashboard.js';

type Mode = 'plan' | 'apply' | 'status' | 'ui';

export interface AppProps {
  mode: Mode;
  ids?: string[];
  verbose?: boolean;
}

export default function App({ mode, ids, verbose }: AppProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (mode === 'ui') return; // UI mode is handled separately

    const engine = new Engine({ verbose });
    for (const mod of allModules) engine.register(mod);

    async function run() {
      setLines((l) => [...l, chalk.gray(`Mode: ${mode}`)]);
      try {
        if (mode === 'plan') {
          const plans = await engine.plan(ids);
          for (const [id, plan] of Object.entries(plans)) {
            if (plan.changes.length === 0) {
              setLines((l) => [...l, `${chalk.cyan(id)}: no changes`]);
            } else {
              setLines((l) => [...l, `${chalk.cyan(id)}:`]);
              for (const change of plan.changes) {
                setLines((l) => [...l, `  - ${change.summary}`]);
              }
            }
          }
        } else if (mode === 'apply') {
          const results = await engine.apply(ids);
          for (const [id, res] of Object.entries(results)) {
            const color = res.success ? chalk.green : chalk.red;
            const msg = res.message ?? '';
            const err = res.success ? '' : (res.error instanceof Error ? ` (${res.error.message})` : (res.error ? ` (${String(res.error)})` : ''));
            setLines((l) => [...l, `${chalk.cyan(id)}: ${color(res.success ? 'ok' : 'failed')} ${msg}${err}`]);
          }
        } else if (mode === 'status') {
          const statuses = await engine.statuses(ids);
          
          // Get current theme colors for status formatting
          let themeColors = null;
          try {
            const ctx = engine.buildContext();
            // Try to get the current theme from the state, with better error handling
            let currentTheme = 'dracula';
            try {
              const savedTheme = ctx.state.get<string>('themes.current');
              if (savedTheme) {
                currentTheme = savedTheme;
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
                currentTheme = state.themes?.current || 'dracula';
              } catch (fileError) {
                // Fallback to dracula if all else fails
                currentTheme = 'dracula';
              }
            }
            
            const { themeContextProvider } = await import('../core/theme-context.js');
            themeColors = await themeContextProvider.getThemeColors(currentTheme);
          } catch (error) {
            // Fallback to default colors if theme loading fails
            console.warn('Failed to load theme colors for status display:', error);
          }
          
          for (const [id, st] of Object.entries(statuses)) {
            setLines((l) => [...l, `${formatStatus(st, false, themeColors)} ${formatModuleId(id)}`]);
          }
        }
      } finally {
        setDone(true);
      }
    }
    void run();
  }, [mode, ids, verbose]);

  // UI mode with theme support
  if (mode === 'ui') {
    const engine = new Engine({ verbose });
    for (const mod of allModules) engine.register(mod);
    const ctx = engine.buildContext();
    
    return (
      <ThemeProvider engineContext={ctx}>
        <Dashboard verbose={verbose} />
      </ThemeProvider>
    );
  }

  return (
    <Box flexDirection="column">
      {!done && (
        <Text color="yellow">
          <Spinner type="dots" />{' '}Processing...
        </Text>
      )}
      {lines.map((line, idx) => (
        <Text key={idx}>{line}</Text>
      ))}
    </Box>
  );
}

/**
 * Format module ID with the last part in white, similar to Jest's test name formatting
 * Example: "apps:kitty" becomes "apps:" in grey + "kitty" in white
 */
function formatModuleId(id: string): string {
  const parts = id.split(':');
  if (parts.length === 1) {
    // No colon, just return the whole ID in white
    return chalk.white(id);
  }
  
  // Split by colon and format: prefix in grey, last part in white
  const prefix = parts.slice(0, -1).join(':') + ':';
  const lastPart = parts[parts.length - 1];
  
  return chalk.grey(prefix) + chalk.white(lastPart);
}
