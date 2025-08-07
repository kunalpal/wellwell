set nocompatible
set number
set relativenumber
set tabstop=4
set shiftwidth=4
set expandtab
set smartindent
set ignorecase
set smartcase
set incsearch
set hlsearch
set hidden
set termguicolors
syntax on

" mappings
nnoremap <space> <Nop>
let mapleader = " "
nnoremap <leader>w :w<CR>
nnoremap <leader>q :q<CR>

" Plugins via vim-plug if present
if filereadable(expand('~/.vim/autoload/plug.vim'))
  call plug#begin('~/.vim/plugged')
  Plug 'tpope/vim-sensible'
  Plug 'tpope/vim-fugitive'
  Plug 'junegunn/fzf', { 'do': { -> fzf#install() } }
  Plug 'junegunn/fzf.vim'
  call plug#end()
endif


