#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const cliPath = path.join(__dirname, '..', 'dist', 'cli', 'index.js');
try {
  const content = fs.readFileSync(cliPath, 'utf8');
  const shebang = '#!/usr/bin/env node\n';
  if (!content.startsWith('#!')) {
    fs.writeFileSync(cliPath, shebang + content, { mode: 0o755 });
  } else {
    fs.chmodSync(cliPath, 0o755);
  }
  // eslint-disable-next-line no-console
  console.log('Shebang ensured for CLI');
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn('Could not ensure shebang for CLI:', err?.message || String(err));
}


