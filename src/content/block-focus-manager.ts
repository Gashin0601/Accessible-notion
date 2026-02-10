/**
 * Block Focus Manager
 *
 * Two-mode navigation system for Notion blocks:
 * - Navigate mode: focus is on a block container, arrow keys move between blocks
 * - Edit mode: focus is inside a contenteditable, normal editing
 *
 * Enter switches Navigate → Edit, Escape switches Edit → Navigate.
 * Arrow ↑/↓ in Navigate mode moves between blocks with aria-live announcements.
 * Inspired by Google Docs / WAI-ARIA Feed pattern.
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

let currentBlockIndex = -1;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let focusinHandler: ((e: FocusEvent) => void) | null = null;
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

// ─── Core Navigation ─────────────────────────────────────────

function focusBlock(index: number): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  if (index < 0) index = 0;
  if (index >= blocks.length) index = blocks.length - 1;

  // Remove tabindex from previous block (roving tabindex)
  if (currentBlockIndex >= 0 && currentBlockIndex < blocks.length) {
    blocks[currentBlockIndex].setAttribute('tabindex', '-1');
  }

  const block = blocks[index];
  currentBlockIndex = index;
  block.setAttribute('tabindex', '0');
  block.focus();
  block.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });

  const msg = buildAnnouncement(block, index, blocks.length);
  announce(msg);
  logDebug(MODULE, `Focused block ${index}: ${block.className}`);
}

// ─── Mode Transitions ────────────────────────────────────────

function enterEditMode(): void {
  const blocks = getAllBlocks();
  if (currentBlockIndex < 0 || currentBlockIndex >= blocks.length) return;

  const block = blocks[currentBlockIndex];
  const editable = block.querySelector<HTMLElement>(TEXTBOX);

  if (editable) {
    // Notion's ContentEditableVoid blocks programmatic focus() calls.
    // Use Selection API to place a cursor inside the contenteditable,
    // then click the block to let Notion's native editing activate.
    const sel = window.getSelection();
    const range = document.createRange();

    // Find a text node to place cursor at end, or collapse into container
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    let lastText: Text | null = null;
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      lastText = node;
    }

    if (lastText) {
      range.setStart(lastText, lastText.length);
    } else {
      range.selectNodeContents(editable);
    }
    range.collapse(false);

    sel?.removeAllRanges();
    sel?.addRange(range);

    // Remove tabindex so the block no longer traps focus in Navigate mode
    block.removeAttribute('tabindex');

    // Simulate a click at the editable's position to activate Notion editing
    const rect = editable.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const clickEvent = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 5,
        clientY: rect.top + rect.height / 2,
        pointerId: 1,
        pointerType: 'mouse',
      });
      editable.dispatchEvent(clickEvent);
    }

    announce('編集モード');
    logDebug(MODULE, 'Entered edit mode');
  } else {
    // Non-editable blocks: try to activate
    const link = block.querySelector<HTMLElement>('a[href]');
    if (link) {
      link.click();
    } else {
      const toggle = block.querySelector<HTMLElement>('[role="button"]');
      if (toggle) {
        toggle.click();
      } else {
        announce('このブロックは編集できません');
      }
    }
  }
}

function exitEditToNavigate(): void {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return;

  const block = active.closest(BLOCK_SELECTABLE) as HTMLElement | null;
  if (!block) return;

  const blocks = getAllBlocks();
  const idx = blocks.indexOf(block);
  if (idx >= 0) {
    currentBlockIndex = idx;
  }

  block.setAttribute('tabindex', '0');

  // Clear Notion's editing state before re-focusing the block container
  window.getSelection()?.removeAllRanges();
  (document.activeElement as HTMLElement | null)?.blur();

  block.focus();

  const msg = buildAnnouncement(block, currentBlockIndex, blocks.length);
  announce(`ナビゲートモード. ${msg}`);
  logDebug(MODULE, 'Returned to navigate mode');
}

// ─── Event Handlers ──────────────────────────────────────────

function handleKeydown(e: KeyboardEvent): void {
  // Skip modifier combos — keyboard-handler manages Alt+Shift shortcuts
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  const active = document.activeElement as HTMLElement | null;
  if (!active) return;

  // ── Navigate mode: focus is on a block container ──
  if (active.matches(BLOCK_SELECTABLE)) {
    // Let Shift+arrow pass through for Notion's multi-block selection
    if (e.shiftKey) return;

    const blocks = getAllBlocks();

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        e.stopPropagation();
        if (currentBlockIndex < blocks.length - 1) {
          focusBlock(currentBlockIndex + 1);
        } else {
          announce('最後のブロックです');
        }
        return;
      }
      case 'ArrowUp': {
        e.preventDefault();
        e.stopPropagation();
        if (currentBlockIndex > 0) {
          focusBlock(currentBlockIndex - 1);
        } else {
          announce('最初のブロックです');
        }
        return;
      }
      case 'Enter': {
        // Let Enter pass through to Notion — it creates a new block or
        // enters editing mode.  Notion's ContentEditableVoid prevents
        // programmatic focus, so we rely on the native Enter behaviour.
        // The user then types normally; Escape returns to Navigate mode.
        announce('編集モード');
        return;
      }
    }
    return;
  }

  // ── Edit mode: Escape from contenteditable returns to block ──
  if (e.key === 'Escape' && !e.shiftKey) {
    const editable = active.closest('[contenteditable="true"]');
    if (editable) {
      const block = active.closest(BLOCK_SELECTABLE);
      if (block && !hasOpenPopupOrDialog()) {
        e.preventDefault();
        e.stopPropagation();
        exitEditToNavigate();
      }
    }
  }
}

function handleFocusin(e: FocusEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  // Track which block is focused for index management
  if (target.matches(BLOCK_SELECTABLE)) {
    const blocks = getAllBlocks();
    const idx = blocks.indexOf(target);
    if (idx >= 0) {
      currentBlockIndex = idx;
    }
  }
}

// ─── Public Navigation API ───────────────────────────────────

/**
 * Enter Navigate mode, focusing a specific block (or first/current).
 */
export function enterNavigateMode(blockIndex?: number): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) {
    announce('ブロックが見つかりません');
    return;
  }

  const idx = blockIndex ?? (currentBlockIndex >= 0 ? currentBlockIndex : 0);
  focusBlock(Math.min(Math.max(0, idx), blocks.length - 1));
  logDebug(MODULE, 'Entered navigate mode');
}

export function navigateNext(): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  if (currentBlockIndex < 0) {
    enterNavigateMode(0);
    return;
  }

  if (currentBlockIndex < blocks.length - 1) {
    focusBlock(currentBlockIndex + 1);
  } else {
    announce('最後のブロックです');
  }
}

export function navigatePrev(): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  if (currentBlockIndex < 0) {
    enterNavigateMode(0);
    return;
  }

  if (currentBlockIndex > 0) {
    focusBlock(currentBlockIndex - 1);
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

  const start = currentBlockIndex < 0 ? 0 : currentBlockIndex + 1;
  for (let i = start; i < blocks.length; i++) {
    const type = detectBlockType(blocks[i]);
    if (type === 'header-block' || type === 'sub_header-block' || type === 'sub_sub_header-block') {
      focusBlock(i);
      return;
    }
  }
  announce('次の見出しがありません');
}

export function navigateToPrevHeading(): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  const start = currentBlockIndex <= 0 ? blocks.length - 1 : currentBlockIndex - 1;
  for (let i = start; i >= 0; i--) {
    const type = detectBlockType(blocks[i]);
    if (type === 'header-block' || type === 'sub_header-block' || type === 'sub_sub_header-block') {
      focusBlock(i);
      return;
    }
  }
  announce('前の見出しがありません');
}

export function navigateToNextHeadingLevel(level: number): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  const targetType = level === 1 ? 'header-block'
    : level === 2 ? 'sub_header-block'
    : 'sub_sub_header-block';

  const start = currentBlockIndex < 0 ? 0 : currentBlockIndex + 1;
  for (let i = start; i < blocks.length; i++) {
    if (detectBlockType(blocks[i]) === targetType) {
      focusBlock(i);
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
    .notion-selectable[data-block-id]:focus {
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
  focusinHandler = handleFocusin;
  document.addEventListener('keydown', keydownHandler, true);
  document.addEventListener('focusin', focusinHandler, true);
  injectFocusStyles();
  logDebug(MODULE, 'Block focus manager initialized');
}

export function destroyBlockFocusManager(): void {
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler, true);
    keydownHandler = null;
  }
  if (focusinHandler) {
    document.removeEventListener('focusin', focusinHandler, true);
    focusinHandler = null;
  }
  styleElement?.remove();
  styleElement = null;
  currentBlockIndex = -1;
  logDebug(MODULE, 'Block focus manager destroyed');
}

export function resetBlockFocusManager(): void {
  currentBlockIndex = -1;
}

// For testing
export function getCurrentIndex(): number {
  return currentBlockIndex;
}
