/**
 * Block Focus Manager — Virtual Cursor
 *
 * Two-mode navigation for Notion blocks:
 * - Navigate mode: virtual cursor highlights blocks, ↑/↓ move between them
 * - Edit mode: all keys pass through to Notion for normal editing
 *
 * Enter switches Navigate → Edit (places caret in block).
 * Escape switches Edit → Navigate (highlights current block).
 *
 * Uses CSS-class highlighting instead of DOM focus to preserve
 * Notion's contenteditable editing system.  Block containers are
 * children of a single whenContentEditable wrapper — moving DOM
 * focus to them breaks text input.
 */

import { logDebug } from '../shared/logger';
import {
  BLOCK_SELECTABLE,
  TEXTBOX,
  MAIN_FRAME,
  detectBlockType,
  BLOCK_TYPE_MAP,
  getBlockText,
} from './selectors';
import { announce } from './live-announcer';

const MODULE = 'BlockFocusManager';
const NAV_HIGHLIGHT_CLASS = 'accessible-notion-nav-focus';

let currentBlockIndex = -1;
let navigateMode = false;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let styleElement: HTMLStyleElement | null = null;

// ─── Block Utilities ─────────────────────────────────────────

function getAllBlocks(): HTMLElement[] {
  const main = document.querySelector(MAIN_FRAME);
  if (!main) return [];
  return Array.from(main.querySelectorAll<HTMLElement>(BLOCK_SELECTABLE));
}

function buildAnnouncement(block: HTMLElement, index: number, total: number): string {
  const blockType = detectBlockType(block);
  const info = blockType ? BLOCK_TYPE_MAP[blockType] : null;
  const typeLabel = info?.description ?? 'ブロック';
  const text = getBlockText(block, 60);

  let msg = typeLabel;
  if (text) {
    msg += `: ${text}`;
  } else {
    msg += ' (空)';
  }

  const expanded = block.getAttribute('aria-expanded');
  if (expanded === 'true') msg += ', 展開';
  else if (expanded === 'false') msg += ', 折りたたみ';

  const checked = block.getAttribute('aria-checked');
  if (checked === 'true') msg += ', チェック済み';
  else if (checked === 'false') msg += ', 未チェック';

  msg += ` (${index + 1}/${total})`;
  return msg;
}

function hasOpenPopupOrDialog(): boolean {
  return !!document.querySelector(
    '.notion-overlay-container [role="dialog"], ' +
    '.notion-overlay-container [role="listbox"], ' +
    '.notion-overlay-container [role="menu"]',
  );
}

// ─── Highlight Management ─────────────────────────────────────

function removeHighlight(): void {
  const prev = document.querySelector(`.${NAV_HIGHLIGHT_CLASS}`);
  prev?.classList.remove(NAV_HIGHLIGHT_CLASS);
}

function moveHighlight(index: number): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  if (index < 0) index = 0;
  if (index >= blocks.length) index = blocks.length - 1;

  removeHighlight();

  const block = blocks[index];
  currentBlockIndex = index;
  block.classList.add(NAV_HIGHLIGHT_CLASS);
  block.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  logDebug(MODULE, `Highlighted block ${index}`);
}

function announceBlock(prefix?: string): void {
  const blocks = getAllBlocks();
  if (currentBlockIndex < 0 || currentBlockIndex >= blocks.length) return;
  const msg = buildAnnouncement(blocks[currentBlockIndex], currentBlockIndex, blocks.length);
  announce(prefix ? `${prefix} ${msg}` : msg);
}

// ─── Event Handler ───────────────────────────────────────────

function handleKeydown(e: KeyboardEvent): void {
  // Skip modifier combos — keyboard-handler manages Alt+Shift shortcuts
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  // ── Navigate mode: virtual cursor is active ──
  if (navigateMode) {
    // Only intercept when focus is within main frame (or on body/document)
    const active = document.activeElement as HTMLElement | null;
    const main = document.querySelector(MAIN_FRAME);
    if (active && main && !main.contains(active)
        && active !== document.body && active !== document.documentElement) {
      return;
    }

    // Let Shift+arrow pass through for Notion's multi-block selection
    if (e.shiftKey) return;

    const blocks = getAllBlocks();
    if (blocks.length === 0) {
      navigateMode = false;
      removeHighlight();
      return;
    }

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        e.stopPropagation();
        if (currentBlockIndex < blocks.length - 1) {
          moveHighlight(currentBlockIndex + 1);
          announceBlock();
        } else {
          announce('最後のブロックです');
        }
        return;
      }
      case 'ArrowUp': {
        e.preventDefault();
        e.stopPropagation();
        if (currentBlockIndex > 0) {
          moveHighlight(currentBlockIndex - 1);
          announceBlock();
        } else {
          announce('最初のブロックです');
        }
        return;
      }
      case 'Enter': {
        // Place caret in the highlighted block's textbox
        if (currentBlockIndex >= 0 && currentBlockIndex < blocks.length) {
          const block = blocks[currentBlockIndex];
          const editable = block.querySelector<HTMLElement>(TEXTBOX);
          if (editable) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editable);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }
        navigateMode = false;
        removeHighlight();
        // Don't preventDefault — let Notion handle Enter
        announce('編集モード');
        logDebug(MODULE, 'Exited navigate mode (Enter)');
        return;
      }
      case 'Escape': {
        if (!hasOpenPopupOrDialog()) {
          e.preventDefault();
          e.stopPropagation();
          navigateMode = false;
          removeHighlight();
          announce('ナビゲートモード終了');
          logDebug(MODULE, 'Exited navigate mode (Escape)');
        }
        return;
      }
    }
    return;
  }

  // ── Not in Navigate mode: Escape from contenteditable → Navigate ──
  if (e.key === 'Escape' && !e.shiftKey) {
    const active = document.activeElement as HTMLElement | null;
    if (!active) return;

    const editable = active.closest('[contenteditable="true"]');
    if (editable) {
      const block = active.closest(BLOCK_SELECTABLE) as HTMLElement | null;
      if (block && !hasOpenPopupOrDialog()) {
        const blocks = getAllBlocks();
        const idx = blocks.indexOf(block);
        if (idx >= 0) {
          e.preventDefault();
          e.stopPropagation();
          navigateMode = true;
          moveHighlight(idx);
          announceBlock('ナビゲートモード.');
          logDebug(MODULE, 'Entered navigate mode (Escape)');
        }
      }
    }
  }
}

// ─── Public Navigation API ───────────────────────────────────

/**
 * Enter Navigate mode, highlighting a specific block (or first/current).
 */
export function enterNavigateMode(blockIndex?: number): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) {
    announce('ブロックが見つかりません');
    return;
  }

  const idx = blockIndex ?? (currentBlockIndex >= 0 ? currentBlockIndex : 0);
  navigateMode = true;
  moveHighlight(Math.min(Math.max(0, idx), blocks.length - 1));
  announceBlock('ナビゲートモード.');
  logDebug(MODULE, 'Entered navigate mode');
}

export function navigateNext(): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  if (!navigateMode || currentBlockIndex < 0) {
    enterNavigateMode(0);
    return;
  }

  if (currentBlockIndex < blocks.length - 1) {
    moveHighlight(currentBlockIndex + 1);
    announceBlock();
  } else {
    announce('最後のブロックです');
  }
}

export function navigatePrev(): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  if (!navigateMode || currentBlockIndex < 0) {
    enterNavigateMode(0);
    return;
  }

  if (currentBlockIndex > 0) {
    moveHighlight(currentBlockIndex - 1);
    announceBlock();
  } else {
    announce('最初のブロックです');
  }
}

export function navigateToFirst(): void {
  enterNavigateMode(0);
}

export function navigateToLast(): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;
  enterNavigateMode(blocks.length - 1);
}

export function navigateToNextHeading(): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  if (!navigateMode) navigateMode = true;

  const start = currentBlockIndex < 0 ? 0 : currentBlockIndex + 1;
  for (let i = start; i < blocks.length; i++) {
    const type = detectBlockType(blocks[i]);
    if (type === 'header-block' || type === 'sub_header-block' || type === 'sub_sub_header-block') {
      moveHighlight(i);
      announceBlock();
      return;
    }
  }
  announce('次の見出しがありません');
}

export function navigateToPrevHeading(): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  if (!navigateMode) navigateMode = true;

  const start = currentBlockIndex <= 0 ? blocks.length - 1 : currentBlockIndex - 1;
  for (let i = start; i >= 0; i--) {
    const type = detectBlockType(blocks[i]);
    if (type === 'header-block' || type === 'sub_header-block' || type === 'sub_sub_header-block') {
      moveHighlight(i);
      announceBlock();
      return;
    }
  }
  announce('前の見出しがありません');
}

export function navigateToNextHeadingLevel(level: number): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  if (!navigateMode) navigateMode = true;

  const targetType = level === 1 ? 'header-block'
    : level === 2 ? 'sub_header-block'
    : 'sub_sub_header-block';

  const start = currentBlockIndex < 0 ? 0 : currentBlockIndex + 1;
  for (let i = start; i < blocks.length; i++) {
    if (detectBlockType(blocks[i]) === targetType) {
      moveHighlight(i);
      announceBlock();
      return;
    }
  }
  announce(`次の見出し${level}がありません`);
}

// ─── Focus Style Injection ───────────────────────────────────

function injectFocusStyles(): void {
  if (styleElement) return;
  styleElement = document.createElement('style');
  styleElement.setAttribute('data-accessible-notion', 'focus-styles');
  styleElement.textContent = `
    .${NAV_HIGHLIGHT_CLASS} {
      outline: 2px solid #2383e2 !important;
      outline-offset: 1px;
      border-radius: 3px;
    }
  `;
  document.head.appendChild(styleElement);
}

// ─── Lifecycle ───────────────────────────────────────────────

export function initBlockFocusManager(): void {
  keydownHandler = handleKeydown;
  document.addEventListener('keydown', keydownHandler, true);
  injectFocusStyles();
  logDebug(MODULE, 'Block focus manager initialized');
}

export function destroyBlockFocusManager(): void {
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler, true);
    keydownHandler = null;
  }
  removeHighlight();
  styleElement?.remove();
  styleElement = null;
  navigateMode = false;
  currentBlockIndex = -1;
  logDebug(MODULE, 'Block focus manager destroyed');
}

export function resetBlockFocusManager(): void {
  navigateMode = false;
  removeHighlight();
  currentBlockIndex = -1;
}

// For testing
export function getCurrentIndex(): number {
  return currentBlockIndex;
}

export function isNavigateMode(): boolean {
  return navigateMode;
}
