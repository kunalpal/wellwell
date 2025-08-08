import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { modules, type ModuleDefinition } from '../modules/registry.js';
import type { ItemStatus } from '../modules/types.js';
import { Table, type TableColumn } from './components/Table.js';
import * as theme from '../modules/theme.js';

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

  useEffect(() => {
    modules.forEach((m) => refreshFor(m));
  }, []);

  useInput(async (input, key) => {
    if (busy) return;
    if (key.leftArrow) {
      setSelectedIndex((i) => (i - 1 + modules.length) % modules.length);
      return;
    }
    if (key.rightArrow) {
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
    } else if (selectedModule.id === 'theme' && (input === '[' || input === ']')) {
      if (palettes.length === 0) return;
      const idx = Math.max(0, palettes.indexOf(activePalette || palettes[0]));
      const nextIdx = input === ']' ? (idx + 1) % palettes.length : (idx - 1 + palettes.length) % palettes.length;
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
      { header: 'Status', width: 10, render: (s) => (s.level === 'ok' ? 'OK' : s.level.toUpperCase()) },
      { header: 'Item', width: 35, render: (s) => s.label },
      { header: 'Details', width: 60, render: (s) => s.details || '' },
    ],
    []
  );

  const rows = statusMap[selectedModule.id] || [];

  return (
    <Box flexDirection="column">
      <Text>
        <Text color="cyan">wellwell</Text> · Modules: {modules.map((m, i) => (i === selectedIndex ? `[${m.label}]` : m.label)).join('  ')}
      </Text>
      {selectedModule.id === 'theme' ? (
        <Text dimColor>
          Palettes: {palettes.join(', ') || 'none'} {activePalette ? `(active: ${activePalette})` : ''}
        </Text>
      ) : null}
      <Box marginTop={1}>
        <Table columns={columns} rows={rows} />
      </Box>
      <Box marginTop={1} flexDirection="column">
        {busy ? <Text color="yellow">Working...</Text> : null}
        {message ? <Text dimColor>{message}</Text> : null}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          Controls: ←/→ switch module  [Enter] refresh  [d] diff  [i] install  [u] update  [q] quit
        </Text>
        {selectedModule.id === 'theme' ? (
          <Text dimColor>Theme: [ and ] to switch active palette</Text>
        ) : null}
      </Box>
    </Box>
  );
}
