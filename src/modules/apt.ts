import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { runCommand } from '../lib/exec.js';
import type { ActionResult, ItemStatus } from './types.js';
import { DOTFILES_ROOT } from '../lib/paths.js';

const lstat = promisify(fs.lstat);
const readFile = promisify(fs.readFile);

const APT_DOTFILES_ROOT = path.join(DOTFILES_ROOT, 'apt');
const MANAGED_APTFILE_PATH = path.join(APT_DOTFILES_ROOT, 'Aptfile');
const MANAGED_BREWFILE_PATH = path.join(DOTFILES_ROOT, 'brew', 'Brewfile');

async function pathExists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

export async function getStatusList(): Promise<ItemStatus[]> {
  const [aptAvailable, aptfilePresent, missingSummary] = await Promise.all([
    detectAptAvailable(),
    detectAptfilePresent(),
    detectMissingPackages(),
  ]);
  return [aptAvailable, aptfilePresent, missingSummary];
}

async function detectAptAvailable(): Promise<ItemStatus> {
  const { stdout } = await runCommand(`command -v apt-get || true`);
  const ok = Boolean(stdout);
  return { id: 'apt-available', label: 'APT available', level: ok ? 'ok' : 'error', details: ok ? stdout : 'apt-get not found' };
}

async function detectAptfilePresent(): Promise<ItemStatus> {
  const exists = await pathExists(MANAGED_APTFILE_PATH);
  return { id: 'aptfile-present', label: 'Aptfile present', level: exists ? 'ok' : 'error', details: MANAGED_APTFILE_PATH };
}

async function readAptfilePackages(): Promise<string[]> {
  const exists = await pathExists(MANAGED_APTFILE_PATH);
  if (!exists) return [];
  const content = await readFile(MANAGED_APTFILE_PATH, 'utf8');
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

async function detectMissingPackages(): Promise<ItemStatus> {
  const apt = await runCommand(`command -v apt-get || true`);
  if (!apt.stdout) return { id: 'apt-missing', label: 'Missing packages', level: 'warning', details: 'apt not available' };
  const pkgs = await readAptfilePackages();
  if (pkgs.length === 0) return { id: 'apt-missing', label: 'Missing packages', level: 'info', details: 'No packages listed' };
  const checks = await Promise.all(
    pkgs.map(async (p) => {
      const res = await runCommand(`dpkg -s ${p} >/dev/null 2>&1 && echo installed || echo missing`);
      return { name: p, installed: res.stdout.trim() === 'installed' };
    })
  );
  const missing = checks.filter((c) => !c.installed).map((c) => c.name);
  return {
    id: 'apt-missing',
    label: 'Missing packages',
    level: missing.length === 0 ? 'ok' : 'warning',
    details: missing.length === 0 ? 'all installed' : `${missing.length} missing: ${missing.slice(0, 20).join(', ')}`,
  };
}

export async function diff(): Promise<ActionResult> {
  try {
    const pkgs = await readAptfilePackages();
    if (pkgs.length === 0) return { ok: true, message: 'No packages listed in Aptfile' };
    const checks = await Promise.all(
      pkgs.map(async (p) => {
        const res = await runCommand(`dpkg -s ${p} >/dev/null 2>&1 && echo installed || echo missing`);
        return `${p} - ${res.stdout.trim()}`;
      })
    );
    return { ok: true, message: checks.join('\n') };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

export async function install(): Promise<ActionResult> {
  try {
    const apt = await runCommand(`command -v apt-get || true`);
    if (!apt.stdout) return { ok: false, message: 'apt-get not found' };

    const pkgs = await readAptfilePackages();
    if (pkgs.length === 0) return { ok: true, message: 'No packages to install' };

    const uid = await runCommand(`id -u || echo 1000`);
    const isRoot = uid.stdout.trim() === '0';
    const hasSudo = (await runCommand(`command -v sudo || true`)).stdout ? true : false;
    const sudoProbe = hasSudo ? await runCommand(`sh -lc 'sudo -n true >/dev/null 2>&1 && echo OK || echo NO'`) : ({ stdout: 'NO', stderr: '' } as any);
    const sudoWorks = sudoProbe.stdout.trim() === 'OK';
    const prefix = isRoot ? '' : sudoWorks ? 'sudo -n ' : '';

    if (!isRoot && !sudoWorks) {
      return { ok: false, message: 'Insufficient privileges to install packages (need root or sudo).' };
    }

    await runCommand(`${prefix}apt-get update || true`);
    const installCmd = `${prefix}apt-get install -y ${pkgs.join(' ')}`;
    const res = await runCommand(installCmd);
    return { ok: true, message: res.stdout.split('\n').slice(0, 20).join('\n') || 'Installed apt packages' };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

export async function update(): Promise<ActionResult> {
  try {
    const apt = await runCommand(`command -v apt-get || true`);
    if (!apt.stdout) return { ok: false, message: 'apt-get not found' };
    const uid = await runCommand(`id -u || echo 1000`);
    const isRoot = uid.stdout.trim() === '0';
    const hasSudo = (await runCommand(`command -v sudo || true`)).stdout ? true : false;
    const sudoProbe = hasSudo ? await runCommand(`sh -lc 'sudo -n true >/dev/null 2>&1 && echo OK || echo NO'`) : ({ stdout: 'NO', stderr: '' } as any);
    const sudoWorks = sudoProbe.stdout.trim() === 'OK';
    const prefix = isRoot ? '' : sudoWorks ? 'sudo -n ' : '';
    if (!isRoot && !sudoWorks) return { ok: false, message: 'Insufficient privileges to update packages (need root or sudo).' };
    await runCommand(`${prefix}apt-get update`);
    await runCommand(`${prefix}apt-get upgrade -y`);
    return { ok: true, message: 'apt updated and upgraded' };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

// Utility to generate Aptfile from Brewfile based on a static mapping
export async function generateAptfileFromBrewfile(): Promise<ActionResult> {
  try {
    const brewExists = await pathExists(MANAGED_BREWFILE_PATH);
    if (!brewExists) return { ok: false, message: `Brewfile not found at ${MANAGED_BREWFILE_PATH}` };
    const content = await readFile(MANAGED_BREWFILE_PATH, 'utf8');
    const brewPkgs = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('brew '))
      .map((l) => l.replace(/^brew\s+"/i, '').replace(/".*/, ''));

    const mapping: Record<string, string | null> = {
      git: 'git',
      node: 'nodejs',
      ripgrep: 'ripgrep',
      fzf: 'fzf',
      starship: 'starship',
      eza: 'eza',
      zoxide: 'zoxide',
      neovim: 'neovim',
      coreutils: 'coreutils',
      bat: 'bat',
      mise: null, // managed separately by mise module
    };

    const aptPkgs = brewPkgs
      .map((b) => mapping[b])
      .filter((v): v is string => Boolean(v));

    await fs.promises.mkdir(APT_DOTFILES_ROOT, { recursive: true });
    const header = [
      '# Aptfile (generated from Brewfile alternatives)',
      '# Update mapping in src/modules/apt.ts if needed',
      '',
    ].join('\n');
    await fs.promises.writeFile(MANAGED_APTFILE_PATH, header + '\n' + aptPkgs.join('\n'));
    return { ok: true, message: `Generated Aptfile with ${aptPkgs.length} packages` };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}


