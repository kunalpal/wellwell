import type { ItemStatus, ActionResult } from './types.js';
import * as zsh from './zsh.js';
import * as starship from './starship.js';
import * as theme from './theme.js';

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
];
