import React from 'react';
import { render, Box, Text } from 'ink';
import meow from 'meow';
import ZshView from './ui/ZshView.js';
import Root from './ui/Root.js';
import * as theme from './modules/theme.js';
import * as brew from './modules/brew.js';

const cli = meow(
  `
  Usage
    $ wellwell [module]

  Modules
    zsh
    theme list            List available palettes
    theme <name>          Set active palette and rebuild
    brew diff             Show brew bundle/outdated summary
    brew install          Apply Brewfile (install missing)
    brew update           Update/upgrade and apply Brewfile

  Examples
    $ wellwell
    $ wellwell zsh
    $ wellwell theme list
    $ wellwell theme vscode
    $ wellwell brew diff
    $ wellwell brew install
`,
  {
    importMeta: import.meta,
    flags: {},
  }
);

const [command, subcommand, arg] = cli.input;

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
    if (subcommand === 'list' || !subcommand) {
      const palettes = await theme.listPalettes();
      process.stdout.write(palettes.join('\n') + '\n');
      return;
    }
    const res = await theme.switchPalette(subcommand);
    const msg = res.message || (res.ok ? `Switched to ${subcommand}` : 'Failed');
    process.stdout.write(msg + '\n');
    return;
  }
  if (command === 'brew') {
    if (subcommand === 'diff') {
      const res = await brew.diff();
      process.stdout.write((res.message || '') + '\n');
      return;
    }
    if (subcommand === 'install') {
      const res = await brew.install();
      process.stdout.write((res.message || '') + '\n');
      return;
    }
    if (subcommand === 'update') {
      const res = await brew.update();
      process.stdout.write((res.message || '') + '\n');
      return;
    }
    process.stdout.write('Unknown brew subcommand\n');
    return;
  }

  render(
    <Box>
      <Text>Unknown module: {command}</Text>
    </Box>
  );
}

main();

