import { AppConfig, type AppConfigOptions } from '../../core/app-config.js';
import type { ConfigurationContext, Platform } from '../../core/types.js';

class NeovimConfig extends AppConfig {
  protected template = (ctx: ConfigurationContext, themeColors?: any): string => {
    const currentTheme = ctx.state.get<string>('themes.current') || 'dracula';
    
    return `-- Neovim configuration managed by wellwell - ${currentTheme} theme
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

-- Theme configuration
vim.cmd([[
  set background=dark
  colorscheme base16-${currentTheme}
]])

-- Set colors for specific highlights
vim.api.nvim_set_hl(0, "Normal", { bg = "${themeColors?.base00 || '#282a36'}", fg = "${themeColors?.base05 || '#f8f8f2'}" })
vim.api.nvim_set_hl(0, "Comment", { fg = "${themeColors?.base03 || '#6272a4'}" })
vim.api.nvim_set_hl(0, "String", { fg = "${themeColors?.base0B || '#f1fa8c'}" })
vim.api.nvim_set_hl(0, "Number", { fg = "${themeColors?.base09 || '#bd93f9'}" })
vim.api.nvim_set_hl(0, "Keyword", { fg = "${themeColors?.base0E || '#ff79c6'}" })
vim.api.nvim_set_hl(0, "Function", { fg = "${themeColors?.base0D || '#50fa7b'}" })
vim.api.nvim_set_hl(0, "Type", { fg = "${themeColors?.base0A || '#8be9fd'}" })
`;
  };

  constructor() {
    super({
      id: 'apps:nvim',
      description: 'Neovim editor with package dependencies',
      dependsOn: ['packages:homebrew', 'packages:apt', 'packages:yum'],
      priority: 60,
      configDir: '.config/nvim',
      configFile: 'init.lua',
      packageDependencies: [
        { name: 'neovim', manager: 'homebrew' as const, platforms: ['macos'] as Platform[] },
        { name: 'ripgrep', manager: 'homebrew' as const, platforms: ['macos'] as Platform[] },
        { name: 'fd', manager: 'homebrew' as const, platforms: ['macos'] as Platform[] },
        { name: 'neovim', manager: 'apt' as const, platforms: ['ubuntu'] as Platform[] },
        { name: 'ripgrep', manager: 'apt' as const, platforms: ['ubuntu'] as Platform[] },
        { name: 'fd-find', manager: 'apt' as const, platforms: ['ubuntu'] as Platform[] },
        { name: 'epel-release', manager: 'yum' as const, platforms: ['al2'] as Platform[] },
        { name: 'neovim', manager: 'yum' as const, platforms: ['al2'] as Platform[] },
        { name: 'ripgrep', manager: 'yum' as const, platforms: ['al2'] as Platform[] },
      ],
      template: (ctx: ConfigurationContext, themeColors?: any): string => {
        const currentTheme = ctx.state.get<string>('themes.current') || 'dracula';
        
        return `-- Neovim configuration managed by wellwell - ${currentTheme} theme
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

-- Theme configuration
vim.cmd([[
  set background=dark
  colorscheme base16-${currentTheme}
]])

-- Set colors for specific highlights
vim.api.nvim_set_hl(0, "Normal", { bg = "${themeColors?.base00 || '#282a36'}", fg = "${themeColors?.base05 || '#f8f8f2'}" })
vim.api.nvim_set_hl(0, "Comment", { fg = "${themeColors?.base03 || '#6272a4'}" })
vim.api.nvim_set_hl(0, "String", { fg = "${themeColors?.base0B || '#f1fa8c'}" })
vim.api.nvim_set_hl(0, "Number", { fg = "${themeColors?.base09 || '#bd93f9'}" })
vim.api.nvim_set_hl(0, "Keyword", { fg = "${themeColors?.base0E || '#ff79c6'}" })
vim.api.nvim_set_hl(0, "Function", { fg = "${themeColors?.base0D || '#50fa7b'}" })
vim.api.nvim_set_hl(0, "Type", { fg = "${themeColors?.base0A || '#8be9fd'}" })
`;
      },
    });
  }
}

export const nvimModule = new NeovimConfig();
