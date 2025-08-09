import { exec as nodeExec, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(nodeExec);

export async function runCommand(command: string, options: { cwd?: string } = {}) {
  if (process.env.WW_VERBOSE === '1') {
    // Stream output live while capturing it
    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn('/bin/zsh', ['-lc', command], {
        cwd: options.cwd,
        env: process.env,
      });
      let stdoutBuf = '';
      let stderrBuf = '';
      child.stdout.on('data', (data) => {
        const text = data.toString();
        stdoutBuf += text;
        process.stdout.write(text);
      });
      child.stderr.on('data', (data) => {
        const text = data.toString();
        stderrBuf += text;
        process.stderr.write(text);
      });
      child.on('error', (err) => reject(err));
      child.on('close', () => resolve({ stdout: stdoutBuf.trim(), stderr: stderrBuf.trim() }));
    });
  }

  const { stdout, stderr } = await execAsync(command, {
    cwd: options.cwd,
    env: process.env,
    shell: '/bin/zsh',
    maxBuffer: 10 * 1024 * 1024, // Increase buffer to handle verbose commands like apt
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}
