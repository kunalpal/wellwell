import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  ApplyResult,
  ConfigurationContext,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from '../../core/types.js';
import { addPackageContribution } from '../../core/contrib.js';

export const nvimModule: ConfigurationModule = {
  id: 'apps:nvim',
  description: 'Neovim editor with package dependencies',
  dependsOn: ['packages:homebrew', 'packages:apt', 'packages:yum'],
  priority: 60,

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    const changes = [];
    
    // Register package dependencies based on platform
    if (ctx.platform === 'macos') {
      addPackageContribution(ctx, { name: 'neovim', manager: 'homebrew' });
      addPackageContribution(ctx, { name: 'ripgrep', manager: 'homebrew' });
      addPackageContribution(ctx, { name: 'fd', manager: 'homebrew' });
    } else if (ctx.platform === 'ubuntu') {
      addPackageContribution(ctx, { name: 'neovim', manager: 'apt' });
      addPackageContribution(ctx, { name: 'ripgrep', manager: 'apt' });
      addPackageContribution(ctx, { name: 'fd-find', manager: 'apt' });
    } else if (ctx.platform === 'al2') {
      // Neovim may need EPEL or manual install on AL2
      addPackageContribution(ctx, { name: 'epel-release', manager: 'yum' });
      addPackageContribution(ctx, { name: 'neovim', manager: 'yum' });
      addPackageContribution(ctx, { name: 'ripgrep', manager: 'yum' });
    }
    
    const configDir = path.join(ctx.homeDir, '.config', 'nvim');
    const initFile = path.join(configDir, 'init.lua');
    
    try {
      await fs.access(initFile);
    } catch {
      changes.push({ summary: `Create Neovim config at ${initFile}` });
    }
    
    return { changes };
  },

  async apply(ctx): Promise<ApplyResult> {
    try {
      const configDir = path.join(ctx.homeDir, '.config', 'nvim');
      const initFile = path.join(configDir, 'init.lua');
      
      // Create basic Neovim config if it doesn't exist
      try {
        await fs.access(initFile);
      } catch {
        await fs.mkdir(configDir, { recursive: true });
        
        const basicConfig = `-- Basic Neovim configuration managed by wellwell
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.expandtab = true
vim.opt.smartindent = true
vim.opt.wrap = false
vim.opt.swapfile = false
vim.opt.backup = false
vim.opt.hlsearch = false
vim.opt.incsearch = true
vim.opt.termguicolors = true
vim.opt.scrolloff = 8
vim.opt.signcolumn = "yes"
vim.opt.isfname:append("@-@")
vim.opt.updatetime = 50
vim.opt.colorcolumn = "80"

-- Set leader key
vim.g.mapleader = " "

-- Basic keymaps
vim.keymap.set("n", "<leader>pv", vim.cmd.Ex)
vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv")
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv")
vim.keymap.set("n", "J", "mzJ\`z")
vim.keymap.set("n", "<C-d>", "<C-d>zz")
vim.keymap.set("n", "<C-u>", "<C-u>zz")
vim.keymap.set("n", "n", "nzzzv")
vim.keymap.set("n", "N", "Nzzzv")
`;
        
        await fs.writeFile(initFile, basicConfig);
        ctx.logger.info({ file: initFile }, 'Created basic Neovim configuration');
        
        return { success: true, changed: true, message: 'Neovim config created' };
      }
      
      return { success: true, changed: false, message: 'Neovim config exists' };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const configDir = path.join(ctx.homeDir, '.config', 'nvim');
    const initFile = path.join(configDir, 'init.lua');
    
    try {
      await fs.access(initFile);
      return { status: 'applied', message: 'Neovim config exists' };
    } catch {
      return { status: 'stale', message: 'Neovim config missing' };
    }
  },
};
