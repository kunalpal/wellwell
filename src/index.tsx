import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './ui/App.js';

const cli = meow(
  `
  Usage
    $ wellwell [--name <name>]

  Options
    --name, -n  Who to greet (default: "World")

  Examples
    $ wellwell --name Kunal
`,
  {
    importMeta: import.meta,
    flags: {
      name: {
        type: 'string',
        shortFlag: 'n',
        default: 'World',
      },
    },
  }
);

render(<App name={cli.flags.name} />);
