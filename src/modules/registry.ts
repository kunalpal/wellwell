import type { ItemStatus, ActionResult } from './types.js';
import * as zsh from './zsh.js';
import * as starship from './starship.js';
import * as theme from './theme.js';
import * as brew from './brew.js';
import * as aliases from './aliases.js';
import * as fzf from './fzf.js';
import * as bat from './bat.js';

export type ModuleDefinition = {
  id: string;
  label: string;
  getStatusList: () => Promise<ItemStatus[]>;
  diff: () => Promise<ActionResult>;
  install: () => Promise<ActionResult>;
  update: () => Promise<ActionResult>;
};

export const modules: ModuleDefinition[] = [
  {
    id: 'zsh',
    label: 'Zsh',
    getStatusList: async () => zsh.getStatusList(),
    diff: async () => zsh.diffModule(),
    install: async () => zsh.installModule(),
    update: async () => zsh.updateModule(),
  },
  {
    id: 'starship',
    label: 'Starship',
    getStatusList: async () => starship.getStatusList(),
    diff: async () => starship.diff(),
    install: async () => starship.install(),
    update: async () => starship.update(),
  },
  {
    id: 'theme',
    label: 'Theme',
    getStatusList: async () => theme.getStatusList(),
    diff: async () => theme.diff(),
    install: async () => theme.install(),
    update: async () => theme.update(),
  },
  {
    id: 'brew',
    label: 'Homebrew',
    getStatusList: async () => brew.getStatusList(),
    diff: async () => brew.diff(),
    install: async () => brew.install(),
    update: async () => brew.update(),
  },
  {
    id: 'aliases',
    label: 'Aliases',
    getStatusList: async () => aliases.getStatusList(),
    diff: async () => aliases.diff(),
    install: async () => aliases.install(),
    update: async () => aliases.update(),
  },
  {
    id: 'fzf',
    label: 'fzf',
    getStatusList: async () => fzf.getStatusList(),
    diff: async () => fzf.diff(),
    install: async () => fzf.install(),
    update: async () => fzf.update(),
  },
  {
    id: 'bat',
    label: 'bat',
    getStatusList: async () => bat.getStatusList(),
    diff: async () => bat.diff(),
    install: async () => bat.install(),
    update: async () => bat.update(),
  },
];
