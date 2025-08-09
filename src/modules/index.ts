import type { ConfigurationModule } from '../core/types.js';
import { homeBinModule } from './common/homebin.js';
import { zshrcModules } from './shell/zshrc/index.js';
import { pathsModule } from './core/paths.js';
import { aliasesModule } from './core/aliases.js';
import { homebrewModule } from './packages/homebrew.js';
import { aptModule } from './packages/apt.js';
import { yumModule } from './packages/yum.js';
import { miseModule } from './packages/mise.js';
import { nvimModule } from './apps/nvim.js';

export const allModules: ConfigurationModule[] = [
  homeBinModule,
  pathsModule,
  aliasesModule,
  homebrewModule,
  aptModule,
  yumModule,
  miseModule,
  nvimModule,
  ...zshrcModules,
];


