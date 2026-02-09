/**
 * F-02: Block Navigation
 *
 * Allows navigating between blocks in the main content area
 * using keyboard shortcuts (Alt+Shift+N/P) and announces
 * block type + content to screen readers.
 */

import { logDebug } from '../shared/logger';
import {
  BLOCK_SELECTABLE,
  BLOCK_TYPE_MAP,
  MAIN_FRAME,
  detectBlockType,
  getBlockText,
} from './selectors';
import { announce } from './live-announcer';

const MODULE = 'BlockNavigator';

let currentBlockIndex = -1;

/**
 * Get all top-level blocks in the main content area (not nested ones).
 */
function getAllBlocks(): HTMLElement[] {
  const main = document.querySelector(MAIN_FRAME);
  if (!main) return [];

  const blocks = main.querySelectorAll<HTMLElement>(BLOCK_SELECTABLE);
  // Filter to exclude blocks nested inside other blocks (e.g. columns, toggles)
  // We include all blocks for navigation — nesting is communicated via aria-level
  return Array.from(blocks);
}

/**
 * Build an announcement string for a block.
 */
function announceBlock(block: HTMLElement): string {
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

  // Toggle state
  const expanded = block.getAttribute('aria-expanded');
  if (expanded === 'true') msg += ', 展開';
  else if (expanded === 'false') msg += ', 折りたたみ';

  // Checkbox state
  const checked = block.getAttribute('aria-checked');
  if (checked === 'true') msg += ', チェック済み';
  else if (checked === 'false') msg += ', 未チェック';

  return msg;
}

/**
 * Navigate to a specific block by index.
 */
function navigateToBlock(index: number): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  // Clamp index
  if (index < 0) index = 0;
  if (index >= blocks.length) index = blocks.length - 1;

  const block = blocks[index];
  currentBlockIndex = index;

  // Focus the block
  if (!block.hasAttribute('tabindex')) {
    block.setAttribute('tabindex', '-1');
  }
  block.focus();

  // Announce
  const position = `${index + 1}/${blocks.length}`;
  const msg = `${announceBlock(block)} (${position})`;
  announce(msg);

  logDebug(MODULE, `Navigated to block ${index}:`, block.className);
}

/**
 * Move to the next block.
 */
export function nextBlock(): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  // If no current block, start from the first one
  if (currentBlockIndex < 0) {
    navigateToBlock(0);
    return;
  }

  if (currentBlockIndex < blocks.length - 1) {
    navigateToBlock(currentBlockIndex + 1);
  } else {
    announce('最後のブロックです');
  }
}

/**
 * Move to the previous block.
 */
export function prevBlock(): void {
  const blocks = getAllBlocks();
  if (blocks.length === 0) return;

  if (currentBlockIndex <= 0) {
    if (currentBlockIndex < 0) {
      navigateToBlock(0);
    } else {
      announce('最初のブロックです');
    }
    return;
  }

  navigateToBlock(currentBlockIndex - 1);
}

/**
 * Announce info about the currently focused block.
 */
export function announceCurrentBlock(): void {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return;

  const block = active.closest(BLOCK_SELECTABLE) as HTMLElement | null;
  if (block) {
    const blocks = getAllBlocks();
    currentBlockIndex = blocks.indexOf(block);
    announce(announceBlock(block));
  } else {
    announce('ブロック外です');
  }
}

/**
 * Read out the heading structure of the current page.
 */
export function announceHeadingOutline(): void {
  const blocks = getAllBlocks();
  const headings: string[] = [];

  for (const block of blocks) {
    const blockType = detectBlockType(block);
    if (blockType === 'header-block' || blockType === 'sub_header-block' || blockType === 'sub_sub_header-block') {
      const text = getBlockText(block, 40);
      const level = blockType === 'header-block' ? 1
        : blockType === 'sub_header-block' ? 2 : 3;
      headings.push(`H${level}: ${text}`);
    }
  }

  if (headings.length === 0) {
    announce('見出しがありません');
    return;
  }

  announce(`見出し構造: ${headings.join(', ')}`);
}

/**
 * Reset navigation state (e.g. on page change).
 */
export function resetBlockNavigation(): void {
  currentBlockIndex = -1;
}

/**
 * Get the current block index (for testing).
 */
export function getCurrentBlockIndex(): number {
  return currentBlockIndex;
}
