import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

function findLinuxbrewBrewPath(): string | null {
  const candidates = [
    '/home/linuxbrew/.linuxbrew/bin/brew',
    path.join(os.homedir(), '.linuxbrew', 'bin', 'brew'),
  ];
  for (const p of candidates) {
    try {
      const stat = fs.statSync(p);
      if (stat.isFile()) return p;
    } catch {}
  }
  return null;
}

async function getBrewShellPrefix(): Promise<{ prefix: string; found: boolean; details: string }>{
  const which = await runCommand(`command -v brew || true`);
  if (which.stdout) {
    return { prefix: '', found: true, details: which.stdout };
  }
  const linuxbrewPath = findLinuxbrewBrewPath();
  if (linuxbrewPath) {
    // Use brew shellenv from absolute path to wire PATH for the following command
    return { prefix: `eval \"$(${linuxbrewPath} shellenv)\"; `, found: true, details: linuxbrewPath };
  }
  return { prefix: '', found: false, details: 'Not found' };
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
  const { found, details } = await getBrewShellPrefix();
  const ok = found;
  return { id: 'brew-installed', label: 'Homebrew installed', level: ok ? 'ok' : 'error', details: ok ? details : 'Not found' };
}

async function detectBrewfilePresent(): Promise<ItemStatus> {
  const exists = await pathExists(MANAGED_BREWFILE_PATH);
  return { id: 'brewfile-present', label: 'Brewfile present', level: exists ? 'ok' : 'error', details: MANAGED_BREWFILE_PATH };
}

async function detectBundleCheck(): Promise<ItemStatus> {
  const prefixInfo = await getBrewShellPrefix();
  if (!prefixInfo.found) return { id: 'brew-bundle-check', label: 'brew bundle check', level: 'error', details: 'brew not installed' };
  const { stdout } = await runCommand(`${prefixInfo.prefix} brew bundle check --file="${MANAGED_BREWFILE_PATH}" || true`);
  const ok = stdout.includes('The Brewfile\'s dependencies are satisfied') || stdout.includes('Satisfy the dependencies manually');
  return { id: 'brew-bundle-check', label: 'brew bundle check', level: ok ? 'ok' : 'warning', details: stdout.split('\n')[0] };
}

async function detectOutdated(): Promise<ItemStatus> {
  const prefixInfo = await getBrewShellPrefix();
  if (!prefixInfo.found) return { id: 'brew-outdated', label: 'brew outdated', level: 'error', details: 'brew not installed' };
  const { stdout } = await runCommand(`${prefixInfo.prefix} brew outdated --greedy --verbose || true`);
  const lines = stdout.split('\n').filter(Boolean);
  return { id: 'brew-outdated', label: 'Outdated packages', level: lines.length === 0 ? 'ok' : 'warning', details: `${lines.length} outdated` };
}

export async function diff(): Promise<ActionResult> {
  // Show bundle check output and the first few lines of outdated
  const prefixInfo = await getBrewShellPrefix();
  if (!prefixInfo.found) return { ok: false, message: 'brew not installed' };
  const check = await runCommand(`${prefixInfo.prefix} brew bundle check --file="${MANAGED_BREWFILE_PATH}" || true`);
  const outdated = await runCommand(`${prefixInfo.prefix} brew outdated --greedy --verbose || true`);
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
  const prefixInfo = await getBrewShellPrefix();
  if (!prefixInfo.found) {
    if (process.platform === 'darwin') {
      // For macOS, use official install script
      await runCommand(`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`);
    } else {
      // Attempt to install Linuxbrew
      const apt = await runCommand(`command -v apt-get || true`);
      const dnf = await runCommand(`command -v dnf || true`);
      const yum = await runCommand(`command -v yum || true`);
      const uid = await runCommand(`id -u || echo 1000`);
      const isRoot = uid.stdout.trim() === '0';
      const hasSudo = (await runCommand(`command -v sudo || true`)).stdout ? true : false;
      // Probe sudo non-interactively and capture a clear OK/NO token from stdout
      const sudoProbe = hasSudo ? await runCommand(`sh -lc 'sudo -n true >/dev/null 2>&1 && echo OK || echo NO'`) : { stdout: 'NO', stderr: '' } as any;
      const sudoWorks = sudoProbe.stdout.trim() === 'OK';
      const canPrivInstall = isRoot || (hasSudo && sudoWorks);

      if (canPrivInstall) {
        // Standard Linuxbrew installation to /home/linuxbrew/.linuxbrew
        const installRes = await runCommand(`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" < /dev/null || true`);
        // If standard install failed due to permissions, fall back to user-local path
        const linuxbrewFound = findLinuxbrewBrewPath();
        if (!linuxbrewFound) {
          const homeLinuxbrew = path.join(os.homedir(), '.linuxbrew');
          await runCommand(`mkdir -p ${homeLinuxbrew} ${homeLinuxbrew}/bin ${homeLinuxbrew}/Homebrew || true`);
          const exists = await pathExists(path.join(homeLinuxbrew, 'Homebrew'));
          if (!exists) {
            await runCommand(`git clone https://github.com/Homebrew/brew ${homeLinuxbrew}/Homebrew`);
          }
          await runCommand(`ln -sf ${homeLinuxbrew}/Homebrew/bin/brew ${homeLinuxbrew}/bin/brew`);
          await runCommand(`eval \"$(${homeLinuxbrew}/bin/brew shellenv)\"; brew --version || true`);
        } else {
          await runCommand(`eval \"$(${linuxbrewFound} shellenv)\"; brew --version || true`);
        }
      } else {
        // Fallback: user-local (unsupported) install in ~/.linuxbrew without sudo
        const homeLinuxbrew = path.join(os.homedir(), '.linuxbrew');
        await runCommand(`mkdir -p ${homeLinuxbrew} ${homeLinuxbrew}/bin ${homeLinuxbrew}/Homebrew || true`);
        // Clone Homebrew only if not already present
        const exists = await pathExists(path.join(homeLinuxbrew, 'Homebrew'));
        if (!exists) {
          await runCommand(`git clone https://github.com/Homebrew/brew ${homeLinuxbrew}/Homebrew`);
        }
        await runCommand(`ln -sf ${homeLinuxbrew}/Homebrew/bin/brew ${homeLinuxbrew}/bin/brew`);
        // Wire shellenv for current process
        await runCommand(`eval \"$(${homeLinuxbrew}/bin/brew shellenv)\"; brew --version || true`);
      }
      // Continue; bundle step will run below if brew is now available
    }
  }
  const afterPrefix = await getBrewShellPrefix();
  if (!afterPrefix.found) {
    return { ok: false, message: 'Homebrew installation attempted but brew still not found.' };
  }
  const res = await runCommand(`${afterPrefix.prefix} brew bundle --file="${MANAGED_BREWFILE_PATH}"`);
  return { ok: true, message: res.stdout.split('\n').slice(0, 20).join('\n') };
}

export async function update(): Promise<ActionResult> {
  const prefixInfo = await getBrewShellPrefix();
  if (!prefixInfo.found) return { ok: false, message: 'brew not installed' };
  await runCommand(`${prefixInfo.prefix} brew update`);
  await runCommand(`${prefixInfo.prefix} brew upgrade --greedy`);
  const res = await runCommand(`${prefixInfo.prefix} brew bundle --file="${MANAGED_BREWFILE_PATH}"`);
  return { ok: true, message: 'Brew updated and bundle applied.\n' + res.stdout.split('\n').slice(0, 20).join('\n') };
}
