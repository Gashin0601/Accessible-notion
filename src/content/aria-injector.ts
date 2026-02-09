/**
 * ARIA Injector — core module for annotating Notion DOM with ARIA attributes.
 *
 * Handles:
 * - Block containers: role, aria-roledescription, aria-label
 * - Textboxes: aria-label from content
 * - Toggle blocks: aria-expanded
 * - To-do blocks: aria-checked
 * - Column layouts: aria-label with column count
 * - Images: alt fallback
 */

import { EXTENSION_ATTR } from '../shared/constants';
import { logDebug } from '../shared/logger';
import {
  BLOCK_SELECTABLE,
  BLOCK_TYPE_MAP,
  TEXTBOX,
  TOGGLE_BLOCK,
  detectBlockType,
  getBlockText,
} from './selectors';

const MODULE = 'AriaInjector';

/** Mark an element as processed by this extension */
function mark(el: Element): void {
  el.setAttribute(EXTENSION_ATTR, 'true');
}

function isMarked(el: Element): boolean {
  return el.hasAttribute(EXTENSION_ATTR);
}

/**
 * Enhance a single block container with semantic ARIA.
 */
export function enhanceBlock(block: Element): void {
  const blockType = detectBlockType(block);
  if (!blockType) return;

  const info = BLOCK_TYPE_MAP[blockType];
  if (!info) return;

  // Set role if not already present
  if (!block.getAttribute('role')) {
    block.setAttribute('role', info.role);
  }

  // Set aria-roledescription
  if (!block.getAttribute('aria-roledescription')) {
    block.setAttribute('aria-roledescription', info.description);
  }

  // Build aria-label from content
  const text = getBlockText(block);
  if (text) {
    block.setAttribute('aria-label', `${info.description}: ${text}`);
  } else {
    block.setAttribute('aria-label', `${info.description} (空)`);
  }

  // Toggle-specific: aria-expanded
  if (blockType === 'toggle-block') {
    enhanceToggle(block);
  }

  // To-do-specific: aria-checked
  if (blockType === 'to_do-block') {
    enhanceTodo(block);
  }

  // Column layout: column count
  if (blockType === 'column_list-block') {
    const columns = block.querySelectorAll(':scope > div.notion-column-block, :scope > div[class*="notion-column-block"]');
    if (columns.length > 0) {
      block.setAttribute('aria-label', `${info.description} (${columns.length}列)`);
    }
  }

  // Column: position
  if (blockType === 'column-block') {
    const parent = block.parentElement;
    if (parent) {
      const siblings = Array.from(parent.querySelectorAll(':scope > div.notion-column-block, :scope > div[class*="notion-column-block"]'));
      const index = siblings.indexOf(block as HTMLElement);
      if (index >= 0) {
        block.setAttribute('aria-label', `${info.description} (${index + 1}列目)`);
      }
    }
  }

  // Make block focusable for keyboard navigation
  if (!block.hasAttribute('tabindex')) {
    block.setAttribute('tabindex', '-1');
  }

  mark(block);
}

function enhanceToggle(block: Element): void {
  // Notion toggles use a disclosure pattern; check if open
  const content = block.querySelector(':scope > div:nth-child(2)');
  const isExpanded = content ? content.children.length > 0 && getComputedStyle(content as HTMLElement).display !== 'none' : false;
  block.setAttribute('aria-expanded', String(isExpanded));
}

function enhanceTodo(block: Element): void {
  const checkbox = block.querySelector('[role="checkbox"], input[type="checkbox"], div[style*="check"]');
  if (checkbox) {
    const checked = checkbox.getAttribute('aria-checked') === 'true'
      || (checkbox as HTMLInputElement).checked
      || checkbox.querySelector('svg') !== null;
    block.setAttribute('aria-checked', String(checked));
  }
}

/**
 * Enhance textbox elements with proper aria-label.
 */
export function enhanceTextbox(textbox: Element): void {
  if (isMarked(textbox)) return;

  const blockParent = textbox.closest(BLOCK_SELECTABLE);
  const blockType = blockParent ? detectBlockType(blockParent) : null;
  const info = blockType ? BLOCK_TYPE_MAP[blockType] : null;
  const prefix = info?.description ?? 'テキスト';

  const text = (textbox.textContent ?? '').trim();
  const placeholder = textbox.getAttribute('placeholder') ?? '';

  if (text) {
    const truncated = text.length > 80 ? text.slice(0, 80) + '…' : text;
    textbox.setAttribute('aria-label', `${prefix}: ${truncated}`);
  } else if (placeholder) {
    textbox.setAttribute('aria-label', `${prefix}: ${placeholder}`);
  } else {
    textbox.setAttribute('aria-label', `${prefix} (空)`);
  }

  mark(textbox);
}

/**
 * Enhance images missing alt text.
 */
export function enhanceImage(img: HTMLImageElement): void {
  if (isMarked(img)) return;
  if (img.alt && img.alt.trim()) {
    mark(img);
    return;
  }

  // Try to find a caption sibling
  const parent = img.closest('.notion-image-block, .notion-selectable');
  if (parent) {
    const caption = parent.querySelector('figcaption, [class*="caption"]');
    if (caption?.textContent?.trim()) {
      img.alt = caption.textContent.trim();
      mark(img);
      return;
    }
  }

  img.alt = '画像';
  mark(img);
}

/**
 * Run a full scan of the page and enhance all discoverable elements.
 */
export function scanAndEnhance(): number {
  let count = 0;

  // Blocks
  const blocks = document.querySelectorAll(BLOCK_SELECTABLE);
  for (const block of blocks) {
    if (!isMarked(block)) {
      enhanceBlock(block);
      count++;
    }
  }

  // Textboxes
  const textboxes = document.querySelectorAll(TEXTBOX);
  for (const tb of textboxes) {
    if (!isMarked(tb)) {
      enhanceTextbox(tb);
      count++;
    }
  }

  // Images
  const images = document.querySelectorAll<HTMLImageElement>('img:not([data-accessible-notion])');
  for (const img of images) {
    enhanceImage(img);
    count++;
  }

  logDebug(MODULE, `Scan complete: ${count} elements enhanced`);
  return count;
}
