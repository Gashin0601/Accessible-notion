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

/** Request DOMLock protection for an element's ARIA attributes */
function protect(el: Element): void {
  el.dispatchEvent(new CustomEvent('accessible-notion-protect', { bubbles: false }));
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

  // Heading-specific: aria-level
  if (info.ariaLevel) {
    block.setAttribute('aria-level', String(info.ariaLevel));
  }

  // Set aria-roledescription for non-standard roles
  if (!block.getAttribute('aria-roledescription') && info.role !== 'heading') {
    block.setAttribute('aria-roledescription', info.description);
  }

  // Build aria-label from content
  const rdLabel = block.getAttribute('aria-roledescription') ?? info.description;

  // DB blocks: extract title only (not view tabs/content)
  if (blockType === 'collection_view-block' || blockType === 'collection_view_page-block') {
    const dbTitle = getDbTitle(block);
    block.setAttribute('aria-label', dbTitle
      ? `${rdLabel}: ${dbTitle}`
      : rdLabel);
  } else {
    const text = getBlockText(block);
    if (text) {
      block.setAttribute('aria-label', `${rdLabel}: ${text}`);
    } else {
      block.setAttribute('aria-label', `${rdLabel} (空)`);
    }
  }

  // Toggle-specific: aria-expanded
  if (blockType === 'toggle-block') {
    enhanceToggle(block);
  }

  // To-do-specific: aria-checked
  if (blockType === 'to_do-block') {
    enhanceTodo(block);
  }

  // Code block: detect programming language
  if (blockType === 'code-block') {
    enhanceCodeBlock(block);
  }

  // Callout block: detect icon/type
  if (blockType === 'callout-block') {
    enhanceCallout(block, rdLabel);
  }

  // Bookmark block: extract URL/title
  if (blockType === 'bookmark-block') {
    enhanceBookmark(block);
  }

  // File/audio block: extract filename
  if (blockType === 'file-block' || blockType === 'audio-block') {
    enhanceFileBlock(block, rdLabel);
  }

  // Equation block: extract formula text
  if (blockType === 'equation-block') {
    enhanceEquation(block, rdLabel);
  }

  // Video block: extract iframe title or video source
  if (blockType === 'video-block') {
    enhanceVideoBlock(block, rdLabel);
  }

  // Embed block: extract iframe title or service name
  if (blockType === 'embed-block') {
    enhanceEmbedBlock(block, rdLabel);
  }

  // Simple table block: inject table semantics
  if (blockType === 'table-block') {
    enhanceSimpleTable(block);
  }

  // Synced block: indicate synced status
  if (blockType === 'synced_block-block') {
    enhanceSyncedBlock(block, rdLabel);
  }

  // Table of contents: enhance with heading count
  if (blockType === 'table_of_contents-block') {
    enhanceTableOfContents(block, rdLabel);
  }

  // Column layout: column count
  if (blockType === 'column_list-block') {
    const columns = block.querySelectorAll('.notion-column-block');
    if (columns.length > 0) {
      block.setAttribute('aria-label', `${info.description} (${columns.length}列)`);
    }
  }

  // Column: position
  if (blockType === 'column-block') {
    const columnList = block.closest('.notion-column_list-block');
    if (columnList) {
      const siblings = Array.from(columnList.querySelectorAll('.notion-column-block'));
      const index = siblings.indexOf(block as HTMLElement);
      if (index >= 0) {
        block.setAttribute('aria-label', `${info.description} (${index + 1}/${siblings.length}列目)`);
      }
    }
  }

  // Make block focusable for keyboard navigation
  if (!block.hasAttribute('tabindex')) {
    block.setAttribute('tabindex', '-1');
  }

  mark(block);
  protect(block);
}

/**
 * Extract DB title from a collection_view block without picking up view tabs/content.
 */
function getDbTitle(block: Element): string {
  // Linked DB: only child is an <a> tag with the DB name
  const firstChild = block.children[0];
  if (firstChild?.tagName === 'A') {
    return firstChild.textContent?.trim() ?? '';
  }

  // Inline DB: look for collection title / icon area
  const titleEl = block.querySelector(
    '[class*="collection-title"], [placeholder*="Untitled"], [placeholder*="無題"]',
  );
  if (titleEl?.textContent?.trim()) {
    return titleEl.textContent.trim();
  }

  // Fallback: check the page title if this is the top-level DB
  const pageTitle = document.querySelector('.notion-page-block h1, [class*="page-title"]');
  if (pageTitle && block.parentElement?.closest('.notion-collection_view-block') === null) {
    return pageTitle.textContent?.trim() ?? '';
  }

  return '';
}

function enhanceCallout(block: Element, rdLabel: string): void {
  // Callout blocks have an icon (emoji or image) + text
  // Try to find the icon
  const iconEl = block.querySelector<HTMLElement>('.notion-record-icon, [class*="callout-icon"], :scope > div:first-child [role="img"]');
  const icon = iconEl?.textContent?.trim() ?? iconEl?.getAttribute('aria-label') ?? '';
  const text = getBlockText(block, 60);

  if (icon && text) {
    block.setAttribute('aria-label', `${rdLabel} ${icon}: ${text}`);
  } else if (text) {
    block.setAttribute('aria-label', `${rdLabel}: ${text}`);
  }
}

function enhanceCodeBlock(block: Element): void {
  // Notion code blocks have a language selector — try to find the language label
  const langEl = block.querySelector<HTMLElement>('[class*="code-block"] [role="button"], [class*="language"]');
  const langText = langEl?.textContent?.trim();
  const codeText = getBlockText(block, 30);

  if (langText && langText.length < 30) {
    block.setAttribute('aria-label', `コード (${langText}): ${codeText || '空'}`);
  } else {
    block.setAttribute('aria-label', `コード: ${codeText || '空'}`);
  }
}

function enhanceBookmark(block: Element): void {
  const link = block.querySelector<HTMLAnchorElement>('a[href]');
  const titleEl = block.querySelector<HTMLElement>('[class*="title"], [class*="bookmark-title"]');
  const title = titleEl?.textContent?.trim() ?? link?.textContent?.trim() ?? '';
  const url = link?.href ?? '';

  if (title) {
    block.setAttribute('aria-label', `ブックマーク: ${title}`);
  } else if (url) {
    // Show domain only for brevity
    try {
      const domain = new URL(url).hostname;
      block.setAttribute('aria-label', `ブックマーク: ${domain}`);
    } catch {
      block.setAttribute('aria-label', `ブックマーク: ${url.substring(0, 50)}`);
    }
  }
}

function enhanceFileBlock(block: Element, rdLabel: string): void {
  const link = block.querySelector<HTMLAnchorElement>('a[href]');
  const fileName = link?.textContent?.trim() ?? '';
  if (fileName) {
    block.setAttribute('aria-label', `${rdLabel}: ${fileName}`);
  }
}

function enhanceEquation(block: Element, rdLabel: string): void {
  // Equation blocks render LaTeX — try to get the annotation/alt text
  const mathEl = block.querySelector<HTMLElement>('.katex-html, [class*="equation"]');
  const annotation = block.querySelector<HTMLElement>('annotation');
  const formula = annotation?.textContent?.trim() ?? mathEl?.textContent?.trim() ?? '';
  if (formula) {
    block.setAttribute('aria-label', `${rdLabel}: ${formula.substring(0, 80)}`);
  }
}

function enhanceVideoBlock(block: Element, rdLabel: string): void {
  // Try iframe title
  const iframe = block.querySelector<HTMLIFrameElement>('iframe');
  if (iframe) {
    const title = iframe.getAttribute('title') ?? '';
    const src = iframe.src ?? '';

    // Extract service name from src
    let service = '';
    try {
      const url = new URL(src);
      if (url.hostname.includes('youtube')) service = 'YouTube';
      else if (url.hostname.includes('vimeo')) service = 'Vimeo';
      else if (url.hostname.includes('loom')) service = 'Loom';
      else if (url.hostname.includes('wistia')) service = 'Wistia';
      else service = url.hostname;
    } catch { /* ignore */ }

    if (title) {
      block.setAttribute('aria-label', `${rdLabel}: ${title}`);
    } else if (service) {
      block.setAttribute('aria-label', `${rdLabel} (${service})`);
    }

    // Ensure iframe has a title for accessibility
    if (!iframe.getAttribute('title') && service) {
      iframe.setAttribute('title', `${service}動画`);
    }
    return;
  }

  // Native video element
  const video = block.querySelector<HTMLVideoElement>('video');
  if (video) {
    const src = video.src || video.querySelector('source')?.src || '';
    block.setAttribute('aria-label', `${rdLabel}: 動画${src ? '' : ' (ソース未設定)'}`);
  }
}

function enhanceEmbedBlock(block: Element, rdLabel: string): void {
  const iframe = block.querySelector<HTMLIFrameElement>('iframe');
  if (!iframe) return;

  const title = iframe.getAttribute('title') ?? '';
  const src = iframe.src ?? '';

  let service = '';
  try {
    const url = new URL(src);
    if (url.hostname.includes('figma')) service = 'Figma';
    else if (url.hostname.includes('miro')) service = 'Miro';
    else if (url.hostname.includes('google')) service = 'Google';
    else if (url.hostname.includes('twitter') || url.hostname.includes('x.com')) service = 'X';
    else if (url.hostname.includes('codepen')) service = 'CodePen';
    else if (url.hostname.includes('github')) service = 'GitHub';
    else if (url.hostname.includes('notion')) service = 'Notion';
    else service = url.hostname;
  } catch { /* ignore */ }

  if (title) {
    block.setAttribute('aria-label', `${rdLabel}: ${title}`);
  } else if (service) {
    block.setAttribute('aria-label', `${rdLabel} (${service})`);
  }

  // Ensure iframe has a title
  if (!iframe.getAttribute('title')) {
    iframe.setAttribute('title', service ? `${service}の埋め込み` : '埋め込みコンテンツ');
  }
}

/**
 * Enhance a simple table block (non-database table).
 * notion-table-block contains notion-table_row-block children.
 */
function enhanceSimpleTable(block: Element): void {
  const rows = block.querySelectorAll('.notion-table_row-block');
  if (rows.length === 0) return;

  // Set table role on the block
  block.setAttribute('role', 'table');

  // Count columns from first row's cells
  const firstRow = rows[0];
  const firstRowCells = getSimpleTableCells(firstRow);
  const colCount = firstRowCells.length;

  block.setAttribute('aria-rowcount', String(rows.length));
  block.setAttribute('aria-colcount', String(colCount));

  const text = getBlockText(block, 30);
  block.setAttribute('aria-label', `シンプルテーブル ${rows.length}行 ${colCount}列${text ? ': ' + text : ''}`);

  // Check if first row is a header (Notion may style it differently)
  const firstRowEl = rows[0] as HTMLElement;
  const isHeader = firstRowEl.querySelector('[style*="font-weight: 600"], [style*="font-weight:600"], [style*="font-weight: bold"]') !== null;

  rows.forEach((row, rowIdx) => {
    row.setAttribute('role', 'row');
    row.setAttribute('aria-rowindex', String(rowIdx + 1));

    const cells = getSimpleTableCells(row);
    cells.forEach((cell, colIdx) => {
      const isHeaderCell = rowIdx === 0 && isHeader;
      cell.setAttribute('role', isHeaderCell ? 'columnheader' : 'cell');
      cell.setAttribute('aria-colindex', String(colIdx + 1));

      const cellText = cell.textContent?.trim() ?? '';
      if (cellText) {
        cell.setAttribute('aria-label', cellText);
      }
    });
  });
}

function getSimpleTableCells(row: Element): HTMLElement[] {
  // Simple table cells are direct child divs of the row's inner container
  const inner = row.querySelector('.notion-table-view-row, :scope > div > div');
  if (inner) {
    return Array.from(inner.children as HTMLCollectionOf<HTMLElement>).filter(
      (c) => c.offsetWidth > 0,
    );
  }
  // Fallback: contenteditable cells within the row
  const editables = row.querySelectorAll<HTMLElement>('[contenteditable], [role="textbox"]');
  if (editables.length > 0) return Array.from(editables);
  // Last resort: direct children
  return Array.from(row.children as HTMLCollectionOf<HTMLElement>);
}

function enhanceSyncedBlock(block: Element, rdLabel: string): void {
  // Synced blocks have a colored border and a "synced" indicator
  const sourceLink = block.querySelector<HTMLAnchorElement>('a[href]');
  if (sourceLink) {
    const linkText = sourceLink.textContent?.trim();
    block.setAttribute('aria-label', `${rdLabel}: ${linkText ?? 'リンク元あり'}`);
  } else {
    const text = getBlockText(block, 40);
    block.setAttribute('aria-label', text ? `${rdLabel}: ${text}` : `${rdLabel}`);
  }
}

function enhanceTableOfContents(block: Element, rdLabel: string): void {
  const links = block.querySelectorAll('a');
  block.setAttribute('aria-label', `${rdLabel} (${links.length}件)`);
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
  protect(textbox);
}

/**
 * Enhance images missing alt text.
 */
export function enhanceImage(img: HTMLImageElement): void {
  if (isMarked(img)) return;
  if (img.alt && img.alt.trim()) {
    mark(img);
    protect(img);
    return;
  }

  // Try to find a caption sibling
  const parent = img.closest('.notion-image-block, .notion-selectable');
  if (parent) {
    const caption = parent.querySelector('figcaption, [class*="caption"]');
    if (caption?.textContent?.trim()) {
      img.alt = caption.textContent.trim();
      mark(img);
      protect(img);
      return;
    }
  }

  img.alt = '画像';
  mark(img);
  protect(img);
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
