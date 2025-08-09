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
  const [selectedIndex, setSelectedIndex] = useState(0);
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
    const sortedRows = useMemo(() => {
      const arr = Object.values(rows);
      if (sortKey === 'priority') return arr.sort((a, b) => a.priority - b.priority);
      if (sortKey === 'id') return arr.sort((a, b) => a.id.localeCompare(b.id));
      if (sortKey === 'status') return arr.sort((a, b) => a.status.localeCompare(b.status));
      return arr;
    }, [rows, sortKey]);

    if (key.escape || (input === 'q')) {
      exit();
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(prev => Math.min(sortedRows.length - 1, prev + 1));
    } else if (input === 'a') {
      if (!isApplying) {
        setIsApplying(true);
        const selectedModule = sortedRows[selectedIndex];
        if (selectedModule) {
          // Apply selected module and its dependencies
          void engineRef.current!.apply([selectedModule.id]).finally(() => setIsApplying(false));
        } else {
          // Apply all if no selection
          void engineRef.current!.apply().finally(() => setIsApplying(false));
        }
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

  const selectedModule = sorted[selectedIndex];
  const upstreamDeps = useMemo(() => {
    if (!selectedModule) return new Set<string>();
    const deps = new Set<string>();
    const visited = new Set<string>();
    
    const addDeps = (moduleId: string) => {
      if (visited.has(moduleId)) return;
      visited.add(moduleId);
      const module = rows[moduleId];
      if (module) {
        module.dependsOn.forEach(depId => {
          deps.add(depId);
          addDeps(depId);
        });
      }
    };
    
    addDeps(selectedModule.id);
    return deps;
  }, [selectedModule, rows]);

  return (
    <Box flexDirection="column">
      <Box>
        <Text>
          {chalk.bold('wellwell')} {chalk.gray('– ')}
          {chalk.gray('↑/↓/j/k: navigate  a: apply  p: plan  s: refresh  1/2/3: sort  q: quit')}
        </Text>
      </Box>
      <Box>
        <Text>
          Sort: {sortKey} {selectedModule && (<Text color="cyan"> | Selected: {selectedModule.id}</Text>)}
          {isApplying && (<Text color="yellow"> <Spinner type="dots" /> applying</Text>)}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          {chalk.bold('MODULE'.padEnd(32))}
          {chalk.bold('STATUS'.padEnd(18))}
          {chalk.bold('DEPENDENCIES')}
        </Text>
        {sorted.map((r, idx) => {
          const isSelected = idx === selectedIndex;
          const isHighlighted = selectedModule && (r.id === selectedModule.id || upstreamDeps.has(r.id));
          const isUnsupported = !isModuleApplicable(r.id, rows);
          
          return (
            <Text key={r.id} backgroundColor={isSelected ? 'blue' : undefined}>
              {formatModuleName(r.id, isSelected, isHighlighted, isUnsupported).padEnd(32)}
              {formatStatusPadded(r.status, isSelected, isUnsupported).padEnd(18)}
              {r.dependsOn.length > 0 ? (
                <Text>
                  {r.dependsOn.map((depId, depIdx) => (
                    <Text key={depId}>
                      {depIdx > 0 && <Text color="gray">, </Text>}
                      {formatDependency(depId, rows[depId]?.status, !isModuleApplicable(depId, rows), upstreamDeps.has(depId))}
                    </Text>
                  ))}
                </Text>
              ) : (
                <Text color="gray">—</Text>
              )}
            </Text>
          );
        })}
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

function formatModuleName(moduleId: string, isSelected: boolean, isHighlighted: boolean, isUnsupported: boolean): string {
  let formatted = moduleId;
  
  if (isUnsupported) {
    formatted = chalk.yellow(formatted);
  } else if (isHighlighted) {
    formatted = chalk.bold(formatted);
  }
  
  if (isSelected) {
    formatted = chalk.inverse(formatted);
  }
  
  return formatted;
}

function formatStatusPadded(status: ConfigurationStatus, isSelected?: boolean, isUnsupported?: boolean): string {
  let formatted = formatStatus(status);
  
  if (status === 'idle' && !isUnsupported) {
    formatted = chalk.blue(status);
  }
  
  if (isSelected) {
    formatted = chalk.inverse(formatted);
  }
  
  // Since chalk adds ANSI codes, we need to pad based on the raw status length
  const rawLength = status.length;
  const padding = Math.max(0, 16 - rawLength);
  return formatted + ' '.repeat(padding);
}

function isModuleApplicable(moduleId: string, rows: Record<string, ModuleRow>): boolean {
  // If we have the module in our rows, we can assume it's applicable
  // (engine only loads applicable modules into the dashboard)
  return rows[moduleId] !== undefined;
}

function formatDependency(depId: string, status?: ConfigurationStatus, isUnsupported?: boolean, isHighlighted?: boolean): string {
  if (isUnsupported) {
    return chalk.strikethrough.dim(depId);
  }
  
  let formatted = depId;
  
  if (!status) {
    formatted = chalk.gray(depId);
  } else {
    switch (status) {
      case 'applied':
        formatted = chalk.green(depId);
        break;
      case 'pending':
        formatted = chalk.yellow(depId);
        break;
      case 'failed':
        formatted = chalk.red(depId);
        break;
      case 'skipped':
        formatted = chalk.cyan(depId);
        break;
      case 'idle':
        formatted = chalk.blue(depId);
        break;
      default:
        formatted = chalk.gray(depId);
    }
  }
  
  if (isHighlighted) {
    formatted = chalk.bold(formatted);
  }
  
  return formatted;
}


