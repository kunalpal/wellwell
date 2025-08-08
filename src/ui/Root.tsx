import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { modules, type ModuleDefinition } from '../modules/registry.js';
import type { ItemStatus } from '../modules/types.js';
import { Table, type TableColumn } from './components/Table.js';
import * as theme from '../modules/theme.js';

function levelColor(level: ItemStatus['level']): string {
  switch (level) {
    case 'ok':
      return 'green';
    case 'warning':
      return 'yellow';
    case 'error':
      return 'red';
    default:
      return 'white';
  }
}

function worstLevel(statuses: ItemStatus[]): ItemStatus['level'] {
  let worst: ItemStatus['level'] = 'ok';
  for (const s of statuses) {
    if (s.level === 'error') return 'error';
    if (s.level === 'warning') worst = worst === 'ok' ? 'warning' : worst;
  }
  return worst;
}

export default function Root({ initialModuleId }: { initialModuleId?: string } = {}) {
  const initialIndex = initialModuleId ? Math.max(0, modules.findIndex((m) => m.id === initialModuleId)) : 0;
  const [selectedIndex, setSelectedIndex] = useState(initialIndex === -1 ? 0 : initialIndex);
  const [statusMap, setStatusMap] = useState<Record<string, ItemStatus[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [palettes, setPalettes] = useState<string[]>([]);
  const [activePalette, setActivePalette] = useState<string | null>(null);

  const selectedModule: ModuleDefinition = modules[selectedIndex];

  async function refreshFor(module: ModuleDefinition) {
    const list = await module.getStatusList();
    setStatusMap((m) => ({ ...m, [module.id]: list }));
    if (module.id === 'theme') {
      const p = await theme.listPalettes();
      const a = await theme.getActivePaletteName();
      setPalettes(p);
      setActivePalette(a);
    }
  }

  async function refreshAll() {
    await Promise.all(modules.map((m) => refreshFor(m)));
  }

  useEffect(() => {
    refreshAll();
  }, []);

  useInput(async (input, key) => {
    if (busy) return;

    if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => (i - 1 + modules.length) % modules.length);
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => (i + 1) % modules.length);
      return;
    }
    if (key.return) {
      await refreshFor(selectedModule);
      return;
    }

    if (input === 'q' || key.escape) {
      process.exit(0);
    }

    if (input === 'd') {
      setBusy(true);
      const res = await selectedModule.diff();
      setMessage(res.message || (res.ok ? 'Done' : 'Failed'));
      setBusy(false);
    } else if (input === 'i') {
      setBusy(true);
      const res = await selectedModule.install();
      setMessage(res.message || (res.ok ? 'Done' : 'Failed'));
      setBusy(false);
      await refreshFor(selectedModule);
    } else if (input === 'u') {
      setBusy(true);
      const res = await selectedModule.update();
      setMessage(res.message || (res.ok ? 'Done' : 'Failed'));
      setBusy(false);
      await refreshFor(selectedModule);
    } else if (input === 'a') {
      // Install all
      setBusy(true);
      for (const m of modules) {
        const res = await m.install();
        setMessage(`${m.label}: ${res.message || (res.ok ? 'Installed' : 'Failed')}`);
      }
      setBusy(false);
      await refreshAll();
    } else if (selectedModule.id === 'theme' && (key.tab || input === '\t' || input === '[' || input === ']')) {
      if (palettes.length === 0) return;
      const idx = Math.max(0, palettes.indexOf(activePalette || palettes[0]));
      let nextIdx = idx;
      if (key.tab || input === '\t') {
        nextIdx = (idx + (key.shift ? -1 : 1) + palettes.length) % palettes.length;
      } else {
        nextIdx = input === ']' ? (idx + 1) % palettes.length : (idx - 1 + palettes.length) % palettes.length;
      }
      const next = palettes[nextIdx];
      setBusy(true);
      const res = await theme.switchPalette(next);
      setMessage(res.message || (res.ok ? `Switched to ${next}` : 'Failed'));
      setBusy(false);
      await refreshFor(selectedModule);
    }
  });

  const columns: TableColumn<ItemStatus>[] = useMemo(
    () => [
      { header: 'Status', width: 10, render: (s) => (<Text color={levelColor(s.level)}>{s.level === 'ok' ? 'OK' : s.level.toUpperCase()}</Text>) },
      { header: 'Item', width: 35, render: (s) => s.label },
      { header: 'Details', width: 60, render: (s) => s.details || '' },
    ],
    []
  );

  const rows = statusMap[selectedModule.id] || [];

  return (
    <Box flexDirection="column">
      <Box>
        <Text>
          <Text color="cyan">wellwell</Text> · Manage your dotfiles
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          <Text color="magenta">Overview</Text> · Use ↑/↓ or j/k to select a module, Enter to refresh selected. Press <Text color="green">a</Text> to Install All.
        </Text>
      </Box>
      <Box marginTop={1}>
        <Box flexDirection="column" width={38} marginRight={2}>
          {modules.map((m, i) => {
            const statuses = statusMap[m.id] || [];
            const level = statuses.length ? worstLevel(statuses) : 'info';
            const isSelected = i === selectedIndex;
            return (
              <Box key={m.id}>
                <Text>
                  <Text color={isSelected ? 'cyan' : 'white'}>{isSelected ? '➤ ' : '  '}</Text>
                  <Text color={isSelected ? 'cyan' : 'white'}>[{m.label}] </Text>
                  <Text color={levelColor(level as any)}>● {level.toUpperCase()}</Text>
                </Text>
              </Box>
            );
          })}
        </Box>
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text>
            <Text color="magenta">Details</Text> · {selectedModule.label}
          </Text>
          {selectedModule.id === 'theme' ? (
            <Text dimColor>
              Palettes: {palettes.join(', ') || 'none'} {activePalette ? `(active: ${activePalette})` : ''}
            </Text>
          ) : null}
          <Box marginTop={1}>
            <Table columns={columns} rows={rows} />
          </Box>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {busy ? <Text color="yellow">Working...</Text> : null}
        {message ? <Text dimColor>{message}</Text> : null}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          Controls: ↑/↓ or j/k select module  [Enter] refresh  [d] diff  [i] install  [u] update  [a] install all  [q] quit
        </Text>
        {selectedModule.id === 'theme' ? (
          <Text dimColor>Theme: Tab to switch palette (Shift+Tab for previous)</Text>
        ) : null}
      </Box>
    </Box>
  );
}
