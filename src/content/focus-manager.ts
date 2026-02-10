/**
 * Focus Manager
 *
 * Handles focus movement between landmarks (sidebar, header, main content)
 * and tracks focus for restoration after modals etc.
 */

import { logDebug } from '../shared/logger';
import { SIDEBAR_NAV, MAIN_FRAME, HEADER, TREE_ITEM } from './selectors';
import { announce } from './live-announcer';
import { enterNavigateMode } from './block-focus-manager';

const MODULE = 'FocusManager';

let lastFocusedElement: HTMLElement | null = null;

export function saveFocus(): void {
  lastFocusedElement = document.activeElement as HTMLElement | null;
}

export function restoreFocus(): void {
  if (lastFocusedElement && document.contains(lastFocusedElement)) {
    lastFocusedElement.focus();
    logDebug(MODULE, 'Restored focus to', lastFocusedElement.tagName);
  }
}

export function focusSidebar(): void {
  const sidebar = document.querySelector(SIDEBAR_NAV) as HTMLElement | null;
  if (!sidebar) {
    announce('サイドバーが見つかりません');
    return;
  }

  // Focus the first treeitem with tabindex=0, or the first one
  const activeItem = sidebar.querySelector(`${TREE_ITEM}[tabindex="0"]`) as HTMLElement
    ?? sidebar.querySelector(TREE_ITEM) as HTMLElement;

  if (activeItem) {
    activeItem.focus();
    announce('サイドバー');
  } else {
    sidebar.focus();
    announce('サイドバー');
  }

  logDebug(MODULE, 'Focused sidebar');
}

export function focusMainContent(): void {
  const main = document.querySelector(MAIN_FRAME) as HTMLElement | null;
  if (!main) {
    announce('メインコンテンツが見つかりません');
    return;
  }

  // Enter navigate mode — focuses the first block with announcement
  enterNavigateMode();
  logDebug(MODULE, 'Focused main content');
}

export function focusHeader(): void {
  const header = document.querySelector(HEADER) as HTMLElement | null;
  if (!header) {
    announce('ヘッダーが見つかりません');
    return;
  }

  // Focus first interactive element in header
  const firstInteractive = header.querySelector('a, button, [tabindex="0"]') as HTMLElement | null;
  if (firstInteractive) {
    firstInteractive.focus();
  } else {
    if (!header.hasAttribute('tabindex')) {
      header.setAttribute('tabindex', '-1');
    }
    header.focus();
  }

  announce('ヘッダー');
  logDebug(MODULE, 'Focused header');
}
