import React from 'react';
import { render, Box, Text } from 'ink';
import meow from 'meow';
import ZshView from './ui/ZshView.js';
import Root from './ui/Root.js';
import * as theme from './modules/theme.js';
import * as brew from './modules/brew.js';
import { enterFullscreen, installFullscreenHandlers, leaveFullscreen } from './ui/fullscreen.js';

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

const [command, subcommand] = cli.input;

async function main() {
  if (command === 'theme' && (subcommand === 'list' || subcommand)) {
    // Non-UI commands should not switch to fullscreen
    if (subcommand === 'list' || !subcommand) {
      const palettes = await theme.listPalettes();
      process.stdout.write(palettes.join('\n') + '\n');
      return;
    } else {
      const res = await theme.switchPalette(subcommand);
      process.stdout.write((res.message || '') + '\n');
      return;
    }
  }
  if (command === 'brew' && subcommand) {
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
  }

  // Fullscreen UI
  enterFullscreen();
  installFullscreenHandlers();

  const ui = !command ? <Root /> : command === 'zsh' ? <ZshView /> : (
    <Box>
      <Text>Unknown module: {command}</Text>
    </Box>
  );

  const { unmount, waitUntilExit } = render(ui);
  await waitUntilExit();
  unmount();
  leaveFullscreen();
}

main();

