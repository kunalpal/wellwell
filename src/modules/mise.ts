import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ActionResult, ItemStatus } from './types.js';
import { runCommand } from '../lib/exec.js';
import { MANAGED_MISE_CONFIG_PATH, USER_MISE_CONFIG_PATH } from '../lib/paths.js';

const lstat = promisify(fs.lstat);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);

async function pathExists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

export async function getStatusList(): Promise<ItemStatus[]> {
  const [installed, config, tools] = await Promise.all([
    detectInstalled(),
    detectConfig(),
    detectTools(),
  ]);
  return [installed, config, tools];
}

async function detectInstalled(): Promise<ItemStatus> {
  const { stdout } = await runCommand(`command -v mise || true`);
  const ok = Boolean(stdout);
  return { id: 'mise-installed', label: 'mise installed', level: ok ? 'ok' : 'error', details: ok ? stdout : 'Not found' };
}

async function detectConfig(): Promise<ItemStatus> {
  const managed = await pathExists(MANAGED_MISE_CONFIG_PATH);
  const exists = await pathExists(USER_MISE_CONFIG_PATH);
  let level: ItemStatus['level'] = exists ? 'ok' : 'error';
  let details = USER_MISE_CONFIG_PATH;
  if (exists && managed) {
    const u = await readFile(USER_MISE_CONFIG_PATH, 'utf8').catch(() => '');
    const m = await readFile(MANAGED_MISE_CONFIG_PATH, 'utf8').catch(() => '');
    if (u.trim() !== m.trim()) level = 'warning';
  }
  return { id: 'mise-config', label: 'mise config present', level, details };
}

async function detectTools(): Promise<ItemStatus> {
  const node = await runCommand(`mise which node || true`);
  const python = await runCommand(`mise which python || true`);
  const ok = Boolean(node.stdout) && Boolean(python.stdout);
  const details = `node: ${node.stdout || 'missing'} | python: ${python.stdout || 'missing'}`;
  return { id: 'mise-tools', label: 'node & python installed (mise)', level: ok ? 'ok' : 'warning', details };
}

export async function diff(): Promise<ActionResult> {
  return { ok: true, message: 'mise manages tools declaratively. Ensure config.toml matches desired versions.' };
}

export async function install(): Promise<ActionResult> {
  // Install mise (brew or install script), link config, install tools
  const brew = await runCommand(`command -v brew || true`);
  if (brew.stdout) {
    await runCommand(`brew install mise || true`);
  } else {
    await runCommand(`curl https://mise.run | sh`);
  }
  await mkdir(path.dirname(USER_MISE_CONFIG_PATH), { recursive: true });
  await fs.promises.writeFile(USER_MISE_CONFIG_PATH, await readFile(MANAGED_MISE_CONFIG_PATH, 'utf8'));
  await runCommand(`mise trust "${USER_MISE_CONFIG_PATH}" || true`);
  await runCommand(`mise install`);
  return { ok: true, message: 'mise installed, config linked, node & python installed' };
}

export async function update(): Promise<ActionResult> {
  await runCommand(`mise upgrade || true`);
  await runCommand(`mise install`);
  return { ok: true, message: 'mise tools updated' };
}
