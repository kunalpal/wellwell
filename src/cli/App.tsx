import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import chalk from 'chalk';

import { Engine } from '../core/engine.js';
import { allModules } from '../modules/index.js';

type Mode = 'plan' | 'apply' | 'status';

export interface AppProps {
  mode: Mode;
  ids?: string[];
  verbose?: boolean;
}

export default function App({ mode, ids, verbose }: AppProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
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
          for (const [id, st] of Object.entries(statuses)) {
            setLines((l) => [...l, `${chalk.cyan(id)}: ${st}`]);
          }
        }
      } finally {
        setDone(true);
      }
    }
    void run();
  }, [mode, ids, verbose]);

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


