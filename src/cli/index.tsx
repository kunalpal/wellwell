#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import App from './App.js';
import Dashboard from './Dashboard.js';

const argv = yargs(hideBin(process.argv))
  .scriptName('wellwell')
  .usage('$0 <cmd> [args]')
  .command('plan [ids..]', 'Show planned changes', (y) =>
    y.positional('ids', { type: 'string', array: true, describe: 'Module ids to include' })
  )
  .command('apply [ids..]', 'Apply configurations', (y) =>
    y.positional('ids', { type: 'string', array: true, describe: 'Module ids to include' })
  )
  .command('status [ids..]', 'Show statuses', (y) =>
    y.positional('ids', { type: 'string', array: true, describe: 'Module ids to include' })
  )
  .command('ui', 'Interactive dashboard (top-like)', (y) => y)
  .option('verbose', { type: 'boolean', default: false })
  .demandCommand(1)
  .strict()
  .help()
  .parseSync();

const [command, ...rest] = argv._;
const ids = (argv.ids as string[] | undefined) ?? [];
const idsArg = ids.length > 0 ? ids : undefined;

if (command === 'plan') {
  render(<App mode="plan" ids={idsArg} verbose={argv.verbose} />);
} else if (command === 'apply') {
  render(<App mode="apply" ids={idsArg} verbose={argv.verbose} />);
} else if (command === 'status') {
  render(<App mode="status" ids={idsArg} verbose={argv.verbose} />);
} else if (command === 'ui') {
  render(<Dashboard verbose={argv.verbose} />);
}


