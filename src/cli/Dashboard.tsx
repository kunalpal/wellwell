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
    const engine = new Engine({
      verbose,
      hooks: {
        onModuleStatusChange: ({ id, status }) => {
          setRows((prev) => ({ ...prev, [id]: { ...prev[id], status } }));
        },
      },
    });
    
    // Register all modules with the engine
    modules.forEach((m) => engine.register(m));
    engineRef.current = engine;

    // Only load applicable modules into the dashboard
    void (async () => {
      const ctx = engine.buildContext(); // Get context for filtering applicable modules
      const applicableRows: Record<string, ModuleRow> = {};
      
      for (const m of modules) {
        const isApplicable = await m.isApplicable(ctx);
        if (isApplicable) {
          applicableRows[m.id] = {
            id: m.id,
            status: 'idle',
            priority: m.priority ?? 100,
            dependsOn: m.dependsOn ?? [],
          };
        }
      }
      
      setRows(applicableRows);
      
      // Load initial statuses for applicable modules only
      const statuses = await engine.statuses();
      setRows((prev) => {
        const next = { ...prev };
        for (const [id, st] of Object.entries(statuses)) {
          if (next[id]) {
            next[id] = { ...next[id], status: st };
          }
        }
        return next;
      });
    })();
  }, [modules, verbose]);

  useInput((input, key) => {
    if (key.escape || (input === 'q')) {
      exit();
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex(prev => Math.min(sorted.length - 1, prev + 1));
    } else if (input === 'a') {
      if (!isApplying) {
        setIsApplying(true);
        const selectedModule = sorted[selectedIndex];
        if (selectedModule) {
          // Apply selected module and its dependencies
          void engineRef.current!.apply([selectedModule.id]).finally(() => setIsApplying(false));
        } else {
          setIsApplying(false);
        }
      }
    } else if (input === 'A') {
      if (!isApplying) {
        setIsApplying(true);
        // Apply all modules in topological order
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

  const selectedModule = sorted[selectedIndex];
  const downstreamDeps = useMemo(() => {
    if (!selectedModule) return new Set<string>();
    const deps = new Set<string>();
    const visited = new Set<string>();
    
    const addDependents = (moduleId: string) => {
      if (visited.has(moduleId)) return;
      visited.add(moduleId);
      
      // Find all modules that depend on this one
      Object.values(rows).forEach(module => {
        if (module.dependsOn.includes(moduleId)) {
          deps.add(module.id);
          addDependents(module.id);
        }
      });
    };
    
    addDependents(selectedModule.id);
    return deps;
  }, [selectedModule, rows]);

  return (
    <Box flexDirection="column">
      <Box>
        <Text>
          {chalk.bold('wellwell')} {chalk.gray('– ')}
          {chalk.gray('↑/↓/j/k: navigate  a: apply  A: apply all  p: plan  s: refresh  1/2/3: sort  q: quit')}
        </Text>
      </Box>
      <Box>
        <Text>
          Sort: {sortKey} {selectedModule && (<Text color="cyan"> | Selected: {selectedModule.id}</Text>)}
          {isApplying && (<Text color="yellow"> <Spinner type="dots" /> applying</Text>)}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {/* Header */}
        <Box>
          <Box width={32}>
            <Text bold>MODULE</Text>
          </Box>
          <Box width={16}>
            <Text bold>STATUS</Text>
          </Box>
          <Box flexGrow={1}>
            <Text bold>DEPENDENCIES</Text>
          </Box>
        </Box>
        
        {/* Rows */}
        {sorted.map((r, idx) => {
          const isSelected = idx === selectedIndex;
          const isHighlighted = selectedModule && (r.id === selectedModule.id || downstreamDeps.has(r.id));
          const isUnsupported = !isModuleApplicable(r.id, rows);
          
          return (
            <Box key={r.id}>
              <Box width={32}>
                <Text color={isSelected ? 'blue' : undefined}>
                  {(isSelected ? '❯ ' : '  ')}{formatModuleName(r.id, isSelected, isHighlighted, isUnsupported)}
                </Text>
              </Box>
              <Box width={16}>
                <Text>
                  {formatStatus(r.status, isUnsupported)}
                </Text>
              </Box>
              <Box flexGrow={1}>
                <Text>
                  {r.dependsOn.length > 0 
                    ? r.dependsOn.map((depId, depIdx) => 
                        (depIdx > 0 ? ', ' : '') + 
                        formatDependency(depId, rows[depId]?.status, !isModuleApplicable(depId, rows), downstreamDeps.has(depId))
                      ).join('')
                    : chalk.hex('#FFA500')('~')
                  }
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}



function formatModuleName(moduleId: string, isSelected: boolean, isHighlighted: boolean, isUnsupported: boolean): string {
  // Don't use chalk for selected items since we handle that with Ink's color prop
  if (isSelected) {
    return moduleId;
  }
  
  if (isUnsupported) {
    return chalk.yellow(moduleId);
  }
  
  if (isHighlighted) {
    return chalk.bold(moduleId);
  }
  
  return moduleId;
}

function formatStatus(status: ConfigurationStatus, isUnsupported?: boolean): string {
  if (isUnsupported) {
    // Use ANSI escape codes for strikethrough since chalk may not work properly
    return `\u001b[9m\u001b[2m${status}\u001b[0m`;
  }
  
  switch (status) {
    case 'idle':
      return chalk.blue('idle');
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

function isModuleApplicable(moduleId: string, rows: Record<string, ModuleRow>): boolean {
  // If we have the module in our rows, it's applicable on this platform
  // Non-applicable modules are filtered out during dashboard initialization
  return rows[moduleId] !== undefined;
}

function formatDependency(depId: string, status?: ConfigurationStatus, isUnsupported?: boolean, isHighlighted?: boolean): string {
  let formatted = depId;
  
  if (isUnsupported) {
    // Unsupported dependencies: strikethrough + dim + gray
    // Use ANSI escape codes directly for strikethrough since chalk may not work properly
    formatted = `\u001b[9m\u001b[2m${chalk.gray(depId)}\u001b[0m`;
  } else {
    // All supported dependencies are shown in orange
    formatted = chalk.hex('#FFA500')(depId);
  }
  
  if (isHighlighted) {
    formatted = chalk.bold(formatted);
  }
  
  return formatted;
}


