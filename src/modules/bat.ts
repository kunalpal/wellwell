import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ActionResult, ItemStatus } from './types.js';
import { runCommand } from '../lib/exec.js';
import { MANAGED_BAT_THEMES_DIR, MANAGED_BAT_CONFIG_PATH, USER_BAT_THEMES_DIR, USER_BAT_CONFIG_PATH } from '../lib/paths.js';

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
  const [installed, config, theme] = await Promise.all([
    detectInstalled(),
    detectConfig(),
    detectTheme(),
  ]);
  return [installed, config, theme];
}

async function detectInstalled(): Promise<ItemStatus> {
  const { stdout } = await runCommand(`command -v bat || true`);
  const ok = Boolean(stdout);
  return { id: 'bat-installed', label: 'bat installed', level: ok ? 'ok' : 'error', details: ok ? stdout : 'Not found' };
}

async function detectConfig(): Promise<ItemStatus> {
  const managed = await pathExists(MANAGED_BAT_CONFIG_PATH);
  const exists = await pathExists(USER_BAT_CONFIG_PATH);
  let level: ItemStatus['level'] = exists ? 'ok' : 'error';
  let details = USER_BAT_CONFIG_PATH;
  if (exists && managed) {
    const u = await readFile(USER_BAT_CONFIG_PATH, 'utf8').catch(() => '');
    const m = await readFile(MANAGED_BAT_CONFIG_PATH, 'utf8').catch(() => '');
    if (u.trim() !== m.trim()) level = 'warning';
  }
  return { id: 'bat-config', label: 'bat config present', level, details };
}

async function detectTheme(): Promise<ItemStatus> {
  const managed = await pathExists(path.join(MANAGED_BAT_THEMES_DIR, 'wellwell.tmTheme'));
  const exists = await pathExists(path.join(USER_BAT_THEMES_DIR, 'wellwell.tmTheme'));
  return { id: 'bat-theme', label: 'bat theme installed', level: managed && exists ? 'ok' : managed ? 'warning' : 'error', details: USER_BAT_THEMES_DIR };
}

export async function diff(): Promise<ActionResult> {
  return { ok: true, message: 'bat uses generated theme; config diff minimal. Ensure theme rebuilt via Theme module.' };
}

export async function install(): Promise<ActionResult> {
  // Install bat (brew) and link config & theme, then rebuild cache
  const brew = await runCommand(`command -v brew || true`);
  if (brew.stdout) {
    await runCommand(`brew install bat || true`);
  }
  await mkdir(path.dirname(USER_BAT_CONFIG_PATH), { recursive: true });
  await mkdir(USER_BAT_THEMES_DIR, { recursive: true });
  await fs.promises.cp(MANAGED_BAT_THEMES_DIR, USER_BAT_THEMES_DIR, { recursive: true });
  await fs.promises.writeFile(USER_BAT_CONFIG_PATH, await readFile(MANAGED_BAT_CONFIG_PATH, 'utf8'));
  await runCommand(`bat cache --build || true`);
  return { ok: true, message: 'bat installed/configured and cache built' };
}

export async function update(): Promise<ActionResult> {
  return install();
}
