import type { ConfigurationModule } from '../core/types.js';
import { homeBinModule } from './common/homebin.js';
import { zshrcModules } from './shell/zshrc/index.js';
import { pathsModule } from './core/paths.js';
import { aliasesModule } from './core/aliases.js';
import { envVarsModule } from './core/env-vars.js';
import { shellInitModule } from './core/shell-init.js';
import { homebrewModule } from './packages/homebrew.js';
import { aptModule } from './packages/apt.js';
import { yumModule } from './packages/yum.js';
import { miseModule } from './packages/mise.js';

import { ripgrepModule } from './apps/ripgrep.js';
import { fzfModule } from './apps/fzf.js';
import { ezaModule } from './apps/eza.js';
import { kittyModule } from './apps/kitty.js';
import { wellwellModule } from './apps/wellwell.js';
import { starshipModule } from './shell/starship.js';
import { themesModule } from './themes/index.js';

export const allModules: ConfigurationModule[] = [
  homeBinModule,
  pathsModule,
  aliasesModule,
  envVarsModule,
  shellInitModule,
  themesModule,
  homebrewModule,
  aptModule,
  yumModule,
  miseModule,
  starshipModule,
  ripgrepModule,
  ezaModule,
  fzfModule,
  kittyModule,
  wellwellModule,

  ...zshrcModules,
];


