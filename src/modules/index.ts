import type { ConfigurationModule } from '../core/types.js';
import { homeBinModule } from './common/homebin.js';
import { zshrcModules } from './shell/zshrc/index.js';
import { pathsModule } from './core/paths.js';
import { aliasesModule } from './core/aliases.js';
import { shellInitModule } from './core/shell-init.js';
import { homebrewModule } from './packages/homebrew.js';
import { aptModule } from './packages/apt.js';
import { yumModule } from './packages/yum.js';
import { miseModule } from './packages/mise.js';
import { nvimModule } from './apps/nvim.js';
import { ripgrepModule } from './apps/ripgrep.js';
import { fzfModule } from './apps/fzf.js';
import { ezaModule } from './apps/eza.js';
import { wellwellModule } from './apps/wellwell.js';
import { starshipModule } from './shell/starship.js';

export const allModules: ConfigurationModule[] = [
  homeBinModule,
  pathsModule,
  aliasesModule,
  shellInitModule,
  homebrewModule,
  aptModule,
  yumModule,
  miseModule,
  starshipModule,
  ripgrepModule,
  ezaModule,
  fzfModule,
  wellwellModule,
  nvimModule,
  ...zshrcModules,
];


