import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import chalk from 'chalk';
import Spinner from 'ink-spinner';
import { Engine } from '../core/engine.js';
import type { ConfigurationModule, ConfigurationStatus } from '../core/types.js';
import { allModules } from '../modules/index.js';

type SortKey = 'id' | 'status' | 'priority';

interface ModuleRow {
  id: string;
  status: ConfigurationStatus;
  priority: number;
  dependsOn: string[];
}

export interface DashboardProps {
  verbose?: boolean;
}

export default function Dashboard({ verbose }: DashboardProps) {
  const { exit } = useApp();
  const [rows, setRows] = useState<Record<string, ModuleRow>>({});
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [isApplying, setIsApplying] = useState(false);
  const engineRef = useRef<Engine | null>(null);

  const modules: ConfigurationModule[] = useMemo(() => allModules, []);

  useEffect(() => {
    const initialRows: Record<string, ModuleRow> = {};
    for (const m of modules) {
      initialRows[m.id] = {
        id: m.id,
        status: 'idle',
        priority: m.priority ?? 100,
        dependsOn: m.dependsOn ?? [],
      };
    }
    setRows(initialRows);

    engineRef.current = new Engine({
      verbose,
      hooks: {
        onModuleStatusChange: ({ id, status }) => {
          setRows((prev) => ({ ...prev, [id]: { ...prev[id], status } }));
        },
      },
    });
    modules.forEach((m) => engineRef.current!.register(m));

    // load initial statuses
    void (async () => {
      const statuses = await engineRef.current!.statuses();
      setRows((prev) => {
        const next = { ...prev };
        for (const [id, st] of Object.entries(statuses)) {
          next[id] = { ...next[id], status: st };
        }
        return next;
      });
    })();
  }, [modules, verbose]);

  useInput((input, key) => {
    if (key.escape || (input === 'q')) {
      exit();
    } else if (input === 'a') {
      if (!isApplying) {
        setIsApplying(true);
        void engineRef.current!.apply().finally(() => setIsApplying(false));
      }
    } else if (input === 'p') {
      // plan
      void engineRef.current!.plan();
    } else if (input === 's') {
      // refresh status
      void (async () => {
        const statuses = await engineRef.current!.statuses();
        setRows((prev) => {
          const next = { ...prev };
          for (const [id, st] of Object.entries(statuses)) next[id] = { ...next[id], status: st };
          return next;
        });
      })();
    } else if (input === '1') setSortKey('priority');
    else if (input === '2') setSortKey('id');
    else if (input === '3') setSortKey('status');
  });

  const sorted = useMemo(() => {
    const arr = Object.values(rows);
    if (sortKey === 'priority') return arr.sort((a, b) => a.priority - b.priority);
    if (sortKey === 'id') return arr.sort((a, b) => a.id.localeCompare(b.id));
    if (sortKey === 'status') return arr.sort((a, b) => a.status.localeCompare(b.status));
    return arr;
  }, [rows, sortKey]);

  return (
    <Box flexDirection="column">
      <Box>
        <Text>
          {chalk.bold('wellwell')} {chalk.gray('– ')}
          {chalk.gray('a: apply  p: plan  s: refresh  1/2/3: sort  q: quit')}
        </Text>
      </Box>
      <Box>
        <Text>
          Sort: {sortKey} {isApplying && (<Text color="yellow"> <Spinner type="dots" /> applying</Text>)}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          {chalk.bold('MODULE'.padEnd(32))}
          {chalk.bold('STATUS'.padEnd(10))}
          {chalk.bold('ORDER')}
        </Text>
        {sorted.map((r) => (
          <Text key={r.id}>
            {r.id.padEnd(32)}
            {formatStatusPadded(r.status).padEnd(10)}
            {formatPriority(r.priority)}
            {r.dependsOn.length > 0 && (
              <Text color="gray"> → {r.dependsOn.join(', ')}</Text>
            )}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function formatStatus(status: ConfigurationStatus): string {
  switch (status) {
    case 'idle':
      return chalk.gray('idle');
    case 'pending':
      return chalk.yellow('pending');
    case 'applied':
      return chalk.green('applied');
    case 'failed':
      return chalk.red('failed');
    case 'skipped':
      return chalk.cyan('skipped');
    default:
      return status;
  }
}

function formatStatusPadded(status: ConfigurationStatus): string {
  const formatted = formatStatus(status);
  // Since chalk adds ANSI codes, we need to pad based on the raw status length
  const rawLength = status.length;
  const padding = Math.max(0, 8 - rawLength);
  return formatted + ' '.repeat(padding);
}

function formatPriority(priority: number): string {
  // Convert priority to visual indicators
  if (priority <= 10) return chalk.red('●●●'); // Critical/early
  if (priority <= 25) return chalk.yellow('●●○'); // High
  if (priority <= 50) return chalk.green('●○○'); // Medium
  if (priority <= 75) return chalk.blue('○○○'); // Low
  return chalk.gray('○○○'); // Very low
}


