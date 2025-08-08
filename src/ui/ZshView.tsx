import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { getZshStatus, actionEnsureManagedZshrc, actionLinkZshrc, actionInstallPlugins, actionSetDefaultShellToZsh } from '../modules/zsh.js';
import type { ZshStatus } from '../modules/zsh.js';

function StatusLine({ label, level, details }: { label: string; level: 'ok' | 'warning' | 'error' | 'info'; details?: string }) {
  const color = level === 'ok' ? 'green' : level === 'warning' ? 'yellow' : level === 'error' ? 'red' : 'white';
  return (
    <Box flexDirection="column">
      <Text>
        <Text color={color}>● </Text>
        <Text>{label}</Text>
      </Text>
      {details ? (
        <Text dimColor>  {details}</Text>
      ) : null}
    </Box>
  );
}

export default function ZshView() {
  const [status, setStatus] = useState<ZshStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const s = await getZshStatus();
    setStatus(s);
  }

  useEffect(() => {
    refresh();
  }, []);

  useInput(async (input, key) => {
    if (key.escape || input === 'q') {
      process.exit(0);
    }
    if (busy) return;

    if (input === 's') {
      setBusy('Setting default shell to zsh...');
      const res = await actionSetDefaultShellToZsh();
      setMessage(res.message || (res.ok ? 'Done' : 'Failed'));
      setBusy(null);
      await refresh();
    } else if (input === 'm') {
      setBusy('Writing managed .zshrc...');
      const res = await actionEnsureManagedZshrc();
      setMessage(res.message || (res.ok ? 'Done' : 'Failed'));
      setBusy(null);
      await refresh();
    } else if (input === 'l') {
      setBusy('Linking ~/.zshrc ...');
      const res = await actionLinkZshrc();
      setMessage(res.message || (res.ok ? 'Done' : 'Failed'));
      setBusy(null);
      await refresh();
    } else if (input === 'i') {
      setBusy('Installing plugins...');
      const res = await actionInstallPlugins();
      setMessage(res.message || (res.ok ? 'Done' : 'Failed'));
      setBusy(null);
      await refresh();
    }
  });

  return (
    <Box flexDirection="column">
      <Text>
        <Text color="cyan">wellwell</Text> · Zsh manager
      </Text>
      <Box marginTop={1} flexDirection="column">
        {status ? (
          <>
            <StatusLine label={status.defaultShell.label} level={status.defaultShell.level} details={status.defaultShell.details} />
            <StatusLine label={status.zshrcLink.label} level={status.zshrcLink.level} details={status.zshrcLink.details} />
            <StatusLine label={status.autosuggestions.label} level={status.autosuggestions.level} details={status.autosuggestions.details} />
            <StatusLine label={status.syntaxHighlighting.label} level={status.syntaxHighlighting.level} details={status.syntaxHighlighting.details} />
          </>
        ) : (
          <Text dimColor>Loading status...</Text>
        )}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {busy ? <Text color="yellow">{busy}</Text> : null}
        {message ? <Text dimColor>{message}</Text> : null}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Actions: [s] set default shell → zsh  [m] write managed .zshrc  [l] link ~/.zshrc  [i] install plugins  [q] quit</Text>
      </Box>
    </Box>
  );
}
