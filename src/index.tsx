import React from 'react';
import { render, Box, Text } from 'ink';
import meow from 'meow';
import ZshView from './ui/ZshView.js';

const cli = meow(
  `
  Usage
    $ wellwell [zsh]

  Description
    Manage dotfiles modules. Starts interactive UI for the requested module.

  Examples
    $ wellwell
    $ wellwell zsh
`,
  {
    importMeta: import.meta,
    flags: {},
  }
);

const [command] = cli.input;

function AppRouter() {
  const module = command || 'zsh';
  if (module === 'zsh') {
    return <ZshView />;
  }
  return (
    <Box>
      <Text>Unknown module: {module}</Text>
    </Box>
  );
}

render(<AppRouter />);

