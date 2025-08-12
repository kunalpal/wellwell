import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import chalk from 'chalk';
import Spinner from 'ink-spinner';
import { Engine } from '../core/engine.js';
import type { ConfigurationModule, ConfigurationStatus } from '../core/types.js';
import { allModules } from '../modules/index.js';
import { formatStatus } from './status-format.js';
import { useTheme } from './theme-context.js';
import { getThemeColors } from './theme-utils.js';


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

async function getModuleDetails(module: ConfigurationModule, ctx: any): Promise<string[]> {
  try {
    if (module.getDetails) {
      const details = await module.getDetails(ctx);
      return details;
    } else {
      return [
        `Module: ${module.id}`,
        '  No specific details available'
      ];
    }
  } catch (error) {
    return [`Error loading details: ${error}`];
  }
}

async function getModulePlan(module: ConfigurationModule, ctx: any): Promise<string[]> {
  try {
    const plan = await module.plan(ctx);
    if (plan.changes.length === 0) {
      return ['No changes planned'];
    }
    
    return plan.changes.map(change => {
      const summary = change.summary;
      const details = change.details ? `\n    ${change.details}` : '';
      return `• ${summary}${details}`;
    });
  } catch (error) {
    return [`Error loading plan: ${error}`];
  }
}

export default function Dashboard({ verbose }: DashboardProps) {
  const { exit } = useApp();
  const { currentTheme, themeColors, switchTheme, getAvailableThemes } = useTheme();
  const [rows, setRows] = useState<Record<string, ModuleRow>>({});
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [isApplying, setIsApplying] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [moduleDetails, setModuleDetails] = useState<string[]>([]);
  const [modulePlan, setModulePlan] = useState<string[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const engineRef = useRef<Engine | null>(null);
  const detailsCache = useRef<Record<string, string[]>>({});
  const planCache = useRef<Record<string, string[]>>({});

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
            status: 'stale',
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
    } else if (key.tab) {
      // Theme switching - only when themes module is selected
      const selectedModule = sorted[selectedIndex];
      if (selectedModule && selectedModule.id === 'themes:base16') {
        void (async () => {
          const themes = await getAvailableThemes();
          const currentIndex = themes.findIndex((t: string) => t === currentTheme);
          const nextIndex = (currentIndex + 1) % themes.length;
          const nextTheme = themes[nextIndex];
          
          if (nextTheme && engineRef.current) {
            await switchTheme(nextTheme, engineRef.current.buildContext());
            
            // Mark dependent modules as needing re-apply
            setRows((prev) => {
              const next = { ...prev };
              // Mark themes module and its dependents as stale
              Object.keys(next).forEach(moduleId => {
                if (moduleId === 'themes:base16' || 
                    next[moduleId].dependsOn.includes('themes:base16')) {
                  next[moduleId] = { ...next[moduleId], status: 'stale' };
                }
              });
              return next;
            });
          }
        })();
      }
    } else if (input === 'a') {
      if (!isApplying) {
        setIsApplying(true);
        const selectedModule = sorted[selectedIndex];
        if (selectedModule) {
          // Apply selected module and its dependencies
          void engineRef.current!.apply([selectedModule.id]).finally(() => {
            setIsApplying(false);
            // Clear plan cache for the applied module
            delete planCache.current[selectedModule.id];
          });
        } else {
          setIsApplying(false);
        }
      }
    } else if (input === 'A') {
      if (!isApplying) {
        setIsApplying(true);
        // Apply all modules in topological order
        void engineRef.current!.apply().finally(() => {
          setIsApplying(false);
          // Clear all plan cache since all modules were applied
          planCache.current = {};
        });
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
        // Clear plan cache when status is refreshed
        planCache.current = {};
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

  useEffect(() => {
    if (!selectedModule || !engineRef.current) {
      setModuleDetails([]);
      setModulePlan([]);
      setDetailsLoading(false);
      setPlanLoading(false);
      return;
    }

    // Check cache first for details
    if (detailsCache.current[selectedModule.id]) {
      setModuleDetails(detailsCache.current[selectedModule.id]);
      setDetailsLoading(false);
    } else {
      setDetailsLoading(true);
    }

    // Check cache first for plan
    if (planCache.current[selectedModule.id]) {
      setModulePlan(planCache.current[selectedModule.id]);
      setPlanLoading(false);
    } else {
      setPlanLoading(true);
    }
    
    const loadModuleInfo = async () => {
      try {
        const module = modules.find(m => m.id === selectedModule.id);
        if (module) {
          const ctx = engineRef.current!.buildContext();
          
          // Load details
          if (!detailsCache.current[selectedModule.id]) {
            const details = await getModuleDetails(module, ctx);
            detailsCache.current[selectedModule.id] = details;
            setModuleDetails(details);
            setDetailsLoading(false);
          }
          
          // Load plan for non-applied modules
          if (!planCache.current[selectedModule.id] && selectedModule.status !== 'applied') {
            const plan = await getModulePlan(module, ctx);
            planCache.current[selectedModule.id] = plan;
            setModulePlan(plan);
            setPlanLoading(false);
          } else if (selectedModule.status === 'applied') {
            setModulePlan([]);
            setPlanLoading(false);
          }
        } else {
          setModuleDetails([]);
          setModulePlan([]);
          setDetailsLoading(false);
          setPlanLoading(false);
        }
      } catch (error) {
        setModuleDetails([`Error loading details: ${error}`]);
        setModulePlan([`Error loading plan: ${error}`]);
        setDetailsLoading(false);
        setPlanLoading(false);
      }
    };

    // Use setTimeout to make it non-blocking
    const timeoutId = setTimeout(loadModuleInfo, 0);
    return () => clearTimeout(timeoutId);
  }, [selectedModule, modules]);

  return (
    <Box flexDirection="column">
      <Box>
        <Text>
          {chalk.bold('wellwell')} {chalk.gray('– ')}
          {chalk.gray('↑/↓/j/k: navigate  a: apply  A: apply all  p: plan  s: refresh  1/2/3: sort  tab: switch theme  q: quit')}
        </Text>
      </Box>
      <Box>
        <Text>
          Sort: {sortKey} {selectedModule && (<Text>{formatSelectedModuleInfo(selectedModule.id, themeColors)}</Text>)}
          {isApplying && (
            <Text>
              {getThemeColors(themeColors).semantic.warning(' ')}
              <Spinner type="dots" />
              {getThemeColors(themeColors).semantic.warning(' applying')}
            </Text>
          )}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {/* Header */}
        <Box>
          <Box width={32}>
            <Text bold>MODULE</Text>
          </Box>
          <Box width={12}>
            <Text bold>STATUS</Text>
          </Box>
          <Box flexGrow={1}>
            <Text bold>DEPENDENCIES</Text>
          </Box>
        </Box>
        
        {/* Rows */}
        <Box flexDirection="column" flexShrink={1}>
          {sorted.map((r, idx) => {
            const isSelected = idx === selectedIndex;
            const isHighlighted = selectedModule && (r.id === selectedModule.id || downstreamDeps.has(r.id));
            const isUnsupported = !isModuleApplicable(r.id, rows);
            
            return (
              <Box key={r.id}>
                <Box width={32}>
                  <Text>
                    {formatModuleNameWithSelection(r.id, isSelected, isHighlighted, isUnsupported, themeColors)}
                  </Text>
                </Box>
                <Box width={12}>
                  <Text>
                    {formatStatus(r.status, isUnsupported, themeColors)}
                  </Text>
                </Box>
                <Box flexGrow={1}>
                  <Text>
                    {r.dependsOn.length > 0 
                      ? r.dependsOn.map((depId, depIdx) => 
                          (depIdx > 0 ? ', ' : '') + 
                          formatDependency(depId, rows[depId]?.status, !isModuleApplicable(depId, rows), downstreamDeps.has(depId), themeColors)
                        ).join('')
                      : getThemeColors(themeColors).semantic.muted('~')
                    }
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
        
        {/* Details Pane */}
        {selectedModule && (
          <Box marginTop={1} flexDirection="column">
            {/* Details Section */}
            <Box>
              <Text bold>DETAILS</Text>
              {detailsLoading && (
                <Text>
                  {getThemeColors(themeColors).semantic.warning(' ')}
                  <Spinner type="dots" />
                </Text>
              )}
            </Box>
            {moduleDetails.length > 0 && (
              <Box flexDirection="column" paddingTop={1} paddingLeft={2}>
                {moduleDetails.map((detail, idx) => (
                  <Box key={idx}>
                    <Text>{detail}</Text>
                  </Box>
                ))}
              </Box>
            )}
            
            {/* Plan Section - Only show for non-applied modules */}
            {selectedModule.status !== 'applied' && (
              <>
                <Box marginTop={1}>
                  <Text bold>{getThemeColors(themeColors).semantic.warning('PLAN')}</Text>
                  {planLoading && (
                    <Text>
                      {getThemeColors(themeColors).semantic.warning(' ')}
                      <Spinner type="dots" />
                    </Text>
                  )}
                </Box>
                {modulePlan.length > 0 && (
                  <Box flexDirection="column" paddingTop={1} paddingLeft={2}>
                    {modulePlan.map((planItem, idx) => (
                      <Box key={idx}>
                        <Text>{getThemeColors(themeColors).semantic.warning(planItem)}</Text>
                      </Box>
                    ))}
                  </Box>
                )}
              </>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}



function formatModuleNameWithSelection(moduleId: string, isSelected: boolean, isHighlighted: boolean, isUnsupported: boolean, themeColors: any): string {
  const colors = getThemeColors(themeColors);
  
  // Handle selection indicator and module name with theme colors
  if (isSelected) {
    return `${colors.semantic.info('❯ ')}${colors.semantic.info(moduleId)}`;
  }
  
  // Non-selected modules
  let formattedName = moduleId;
  
  if (isUnsupported) {
    formattedName = colors.semantic.warning(moduleId);
  } else if (isHighlighted) {
    formattedName = colors.semantic.accent.underline(moduleId);
  }
  
  return `  ${formattedName}`;
}

function formatSelectedModuleInfo(moduleId: string, themeColors: any): string {
  const colors = getThemeColors(themeColors);
  return ` ${colors.semantic.info('| Selected: ')}${colors.semantic.info(moduleId)}`;
}



function formatModuleName(moduleId: string, isSelected: boolean, isHighlighted: boolean, isUnsupported: boolean, themeColors: any): string {
  const colors = getThemeColors(themeColors);
  
  if (isUnsupported) {
    return colors.semantic.warning(moduleId);
  }
  
  if (isHighlighted) {
    return colors.semantic.accent.underline(moduleId);
  }
  
  return moduleId;
}



function isModuleApplicable(moduleId: string, rows: Record<string, ModuleRow>): boolean {
  // If we have the module in our rows, it's applicable on this platform
  // Non-applicable modules are filtered out during dashboard initialization
  return rows[moduleId] !== undefined;
}

function formatDependency(depId: string, status?: ConfigurationStatus, isUnsupported?: boolean, isHighlighted?: boolean, themeColors?: any): string {
  const colors = getThemeColors(themeColors);
  let formatted = depId;
  
  if (isUnsupported) {
    // Unsupported dependencies: strikethrough + dim + gray
    // Use ANSI escape codes directly for strikethrough since chalk may not work properly
    formatted = `\u001b[9m\u001b[2m${colors.semantic.muted(depId)}\u001b[0m`;
  } else {
    // All supported dependencies are shown in theme accent color
    formatted = colors.semantic.accent(depId);
  }
  
  if (isHighlighted) {
    formatted = colors.semantic.accent.underline(formatted);
  }
  
  return formatted;
}


