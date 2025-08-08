import type { ItemStatus, ActionResult } from './types.js';
import * as zsh from './zsh.js';

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
];
