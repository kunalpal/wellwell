import { exec as nodeExec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(nodeExec);

export async function runCommand(command: string, options: { cwd?: string } = {}) {
  const { stdout, stderr } = await execAsync(command, { cwd: options.cwd, env: process.env, shell: '/bin/zsh' });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}
