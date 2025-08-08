let enabled = false;

function write(seq: string) {
  try {
    process.stdout.write(seq);
  } catch {
    // ignore
  }
}

export function enterFullscreen() {
  if (enabled) return;
  if (!process.stdout.isTTY) return;
  enabled = true;
  // Enter alternate screen buffer and hide cursor, clear screen, move cursor home
  write('\u001b[?1049h');
  write('\u001b[?25l');
  write('\u001b[2J');
  write('\u001b[H');
}

export function leaveFullscreen() {
  if (!enabled) return;
  enabled = false;
  if (!process.stdout.isTTY) return;
  // Show cursor and leave alternate screen buffer
  write('\u001b[?25h');
  write('\u001b[?1049l');
}

export function installFullscreenHandlers() {
  // Ensure we restore on exit/signals
  const cleanup = () => {
    leaveFullscreen();
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
  process.on('uncaughtException', (err) => {
    cleanup();
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
