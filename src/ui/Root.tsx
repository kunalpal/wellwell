import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { modules, type ModuleDefinition } from '../modules/registry.js';
import type { ItemStatus } from '../modules/types.js';
import { Table, type TableColumn } from './components/Table.js';

export default function Root() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusMap, setStatusMap] = useState<Record<string, ItemStatus[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedModule: ModuleDefinition = modules[selectedIndex];

  async function refreshFor(module: ModuleDefinition) {
    const list = await module.getStatusList();
    setStatusMap((m) => ({ ...m, [module.id]: list }));
  }

  useEffect(() => {
    // Initial fetch
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
      <Box marginTop={1}>
        <Table columns={columns} rows={rows} />
      </Box>
      <Box marginTop={1} flexDirection="column">
        {busy ? <Text color="yellow">Working...</Text> : null}
        {message ? <Text dimColor>{message}</Text> : null}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Controls: ←/→ switch module  [Enter] refresh  [d] diff  [i] install  [u] update  [q] quit</Text>
      </Box>
    </Box>
  );
}
