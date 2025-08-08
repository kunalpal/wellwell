import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { runCommand } from '../lib/exec.js';
import type { ActionResult, ItemStatus } from './types.js';
import { BREW_DOTFILES_ROOT, MANAGED_BREWFILE_PATH } from '../lib/paths.js';

const lstat = promisify(fs.lstat);
const readFile = promisify(fs.readFile);

async function pathExists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

export async function getStatusList(): Promise<ItemStatus[]> {
  const [brewInstalled, brewfilePresent, bundleCheck, outdated] = await Promise.all([
    detectBrewInstalled(),
    detectBrewfilePresent(),
    detectBundleCheck(),
    detectOutdated(),
  ]);
  return [brewInstalled, brewfilePresent, bundleCheck, outdated];
}

async function detectBrewInstalled(): Promise<ItemStatus> {
  const { stdout } = await runCommand(`command -v brew || true`);
  const ok = Boolean(stdout);
  return { id: 'brew-installed', label: 'Homebrew installed', level: ok ? 'ok' : 'error', details: ok ? stdout : 'Not found' };
}

async function detectBrewfilePresent(): Promise<ItemStatus> {
  const exists = await pathExists(MANAGED_BREWFILE_PATH);
  return { id: 'brewfile-present', label: 'Brewfile present', level: exists ? 'ok' : 'error', details: MANAGED_BREWFILE_PATH };
}

async function detectBundleCheck(): Promise<ItemStatus> {
  const brew = await runCommand(`command -v brew || true`);
  if (!brew.stdout) return { id: 'brew-bundle-check', label: 'brew bundle check', level: 'warning', details: 'brew not installed' };
  const { stdout } = await runCommand(`brew bundle check --file="${MANAGED_BREWFILE_PATH}" || true`);
  const ok = stdout.includes('The Brewfile\'s dependencies are satisfied') || stdout.includes('Satisfy the dependencies manually');
  return { id: 'brew-bundle-check', label: 'brew bundle check', level: ok ? 'ok' : 'warning', details: stdout.split('\n')[0] };
}

async function detectOutdated(): Promise<ItemStatus> {
  const brew = await runCommand(`command -v brew || true`);
  if (!brew.stdout) return { id: 'brew-outdated', label: 'brew outdated', level: 'warning', details: 'brew not installed' };
  const { stdout } = await runCommand(`brew outdated --greedy --verbose || true`);
  const lines = stdout.split('\n').filter(Boolean);
  return { id: 'brew-outdated', label: 'Outdated packages', level: lines.length === 0 ? 'ok' : 'warning', details: `${lines.length} outdated` };
}

export async function diff(): Promise<ActionResult> {
  // Show bundle check output and the first few lines of outdated
  const brew = await runCommand(`command -v brew || true`);
  if (!brew.stdout) return { ok: false, message: 'brew not installed' };
  const check = await runCommand(`brew bundle check --file="${MANAGED_BREWFILE_PATH}" || true`);
  const outdated = await runCommand(`brew outdated --greedy --verbose || true`);
  const preview = [
    'brew bundle check:',
    check.stdout.split('\n').slice(0, 10).join('\n'),
    '',
    'brew outdated (first 20):',
    outdated.stdout.split('\n').slice(0, 20).join('\n'),
  ].join('\n');
  return { ok: true, message: preview };
}

export async function install(): Promise<ActionResult> {
  // Install brew if missing (macOS), then bundle install; on Linux, suggest Linuxbrew or skip
  const brew = await runCommand(`command -v brew || true`);
  if (!brew.stdout) {
    if (process.platform === 'darwin') {
      // For macOS, use official install script
      await runCommand(`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`);
    } else {
      return { ok: false, message: 'Homebrew not found. Install Homebrew (Linuxbrew) manually or manage packages via your distro.' };
    }
  }
  const res = await runCommand(`brew bundle --file="${MANAGED_BREWFILE_PATH}"`);
  return { ok: true, message: res.stdout.split('\n').slice(0, 20).join('\n') };
}

export async function update(): Promise<ActionResult> {
  const brew = await runCommand(`command -v brew || true`);
  if (!brew.stdout) return { ok: false, message: 'brew not installed' };
  await runCommand(`brew update`);
  await runCommand(`brew upgrade --greedy`);
  const res = await runCommand(`brew bundle --file="${MANAGED_BREWFILE_PATH}"`);
  return { ok: true, message: 'Brew updated and bundle applied.\n' + res.stdout.split('\n').slice(0, 20).join('\n') };
}
