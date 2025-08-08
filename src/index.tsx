import React from 'react';
import { render, Box, Text } from 'ink';
import meow from 'meow';
import ZshView from './ui/ZshView.js';
import Root from './ui/Root.js';
import * as theme from './modules/theme.js';

const cli = meow(
  `
  Usage
    $ wellwell [module]

  Modules
    zsh
    theme list            List available palettes
    theme <name>          Set active palette and rebuild

  Examples
    $ wellwell
    $ wellwell zsh
    $ wellwell theme list
    $ wellwell theme vscode
`,
  {
    importMeta: import.meta,
    flags: {},
  }
);

const [command, arg] = cli.input;

async function main() {
  if (!command) {
    render(<Root />);
    return;
  }
  if (command === 'zsh') {
    render(<ZshView />);
    return;
  }
  if (command === 'theme') {
    if (arg === 'list' || !arg) {
      const palettes = await theme.listPalettes();
      // Non-ink print for simple CLI output
      process.stdout.write(palettes.join('\n') + '\n');
      return;
    }
    const res = await theme.switchPalette(arg);
    const msg = res.message || (res.ok ? `Switched to ${arg}` : 'Failed');
    process.stdout.write(msg + '\n');
    return;
  }

  render(
    <Box>
      <Text>Unknown module: {command}</Text>
    </Box>
  );
}

main();

