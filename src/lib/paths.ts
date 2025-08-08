import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedProjectRoot: string | null = null;

function findProjectRoot(): string {
  if (cachedProjectRoot) return cachedProjectRoot;
  // Start from this file's directory and walk up until we find package.json
  let current = path.dirname(fileURLToPath(import.meta.url));
  // Go up a few levels to handle dist/src structure
  for (let i = 0; i < 6; i++) {
    const candidate = current;
    const pkg = path.join(candidate, 'package.json');
    if (fs.existsSync(pkg)) {
      cachedProjectRoot = candidate;
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // Fallback to CWD if not found
  cachedProjectRoot = process.cwd();
  return cachedProjectRoot;
}

export const PROJECT_ROOT = findProjectRoot();
export const DOTFILES_ROOT = path.join(PROJECT_ROOT, 'dotfiles');
export const ZSH_DOTFILES_ROOT = path.join(DOTFILES_ROOT, 'zsh');
export const MANAGED_ZSHRC_PATH = path.join(ZSH_DOTFILES_ROOT, '.zshrc');
