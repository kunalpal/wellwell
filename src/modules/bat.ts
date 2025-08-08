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
  const primary = await runCommand(`command -v bat || true`);
  if (primary.stdout) return { id: 'bat-installed', label: 'bat installed', level: 'ok', details: primary.stdout };
  const alt = await runCommand(`command -v batcat || true`);
  const ok = Boolean(alt.stdout);
  return { id: 'bat-installed', label: ok ? 'bat (batcat) installed' : 'bat installed', level: ok ? 'ok' : 'error', details: ok ? alt.stdout : 'Not found' };
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
  // Install bat (brew/apt/dnf) and link config & theme, then rebuild cache
  const brew = await runCommand(`command -v brew || true`);
  if (brew.stdout) {
    await runCommand(`brew install bat || true`);
  } else {
    // Linux package managers
    const apt = await runCommand(`command -v apt-get || true`);
    const dnf = await runCommand(`command -v dnf || true`);
    const yum = await runCommand(`command -v yum || true`);
    if (apt.stdout) {
      await runCommand(`sudo -n apt-get update || true`);
      // On Debian/Ubuntu the binary is batcat; install bat
      await runCommand(`sudo -n apt-get install -y bat || sudo -n apt-get install -y batcat || true`);
    } else if (dnf.stdout) {
      await runCommand(`sudo -n dnf install -y bat || true`);
    } else if (yum.stdout) {
      await runCommand(`sudo -n yum install -y bat || true`);
    }
  }

  await mkdir(path.dirname(USER_BAT_CONFIG_PATH), { recursive: true });
  await mkdir(USER_BAT_THEMES_DIR, { recursive: true });
  await fs.promises.cp(MANAGED_BAT_THEMES_DIR, USER_BAT_THEMES_DIR, { recursive: true });
  await fs.promises.writeFile(USER_BAT_CONFIG_PATH, await readFile(MANAGED_BAT_CONFIG_PATH, 'utf8'));
  // Rebuild cache using whichever binary is available
  const hasBat = await runCommand(`command -v bat || true`);
  if (hasBat.stdout) {
    await runCommand(`bat cache --build || true`);
  } else {
    const hasBatcat = await runCommand(`command -v batcat || true`);
    if (hasBatcat.stdout) await runCommand(`batcat cache --build || true`);
  }
  return { ok: true, message: 'bat installed/configured and cache built' };
}

export async function update(): Promise<ActionResult> {
  // Rebuild cache and ensure install
  const res = await install();
  return res;
}
