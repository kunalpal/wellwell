import React from 'react';
import { render, Box, Text } from 'ink';
import meow from 'meow';
import ZshView from './ui/ZshView.js';
import Root from './ui/Root.js';

const cli = meow(
  `
  Usage
    $ wellwell [module]

  Modules
    zsh

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
  if (!command) return <Root />;
  if (command === 'zsh') return <ZshView />;
  return (
    <Box>
      <Text>Unknown module: {command}</Text>
    </Box>
  );
}

render(<AppRouter />);

