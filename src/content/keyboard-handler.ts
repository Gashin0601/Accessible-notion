/**
 * Keyboard Handler
 *
 * Registers global keyboard shortcuts (Alt+Shift+*) for the extension.
 * Dispatches to the appropriate module based on the key combination.
 */

import { logDebug } from '../shared/logger';
import { focusSidebar, focusMainContent, focusHeader } from './focus-manager';
import {
  nextBlock, prevBlock, announceCurrentBlock, announceHeadingOutline,
  nextHeading, prevHeading, nextHeadingLevel, firstBlock, lastBlock,
} from './block-navigator';
import { announce } from './live-announcer';
import { enterGridMode } from './table-enhancer';
import type { ExtensionSettings } from '../shared/constants';

const MODULE = 'KeyboardHandler';

type ShortcutAction = () => void;

interface ShortcutBinding {
  key: string;
  action: ShortcutAction;
  description: string;
}

const bindings: ShortcutBinding[] = [];

function buildBindings(shortcuts: Record<string, string>): void {
  bindings.length = 0;

  const actionMap: Record<string, { action: ShortcutAction; description: string }> = {
    focusSidebar: { action: focusSidebar, description: 'サイドバーにフォーカス移動' },
    focusMain: { action: focusMainContent, description: 'メインコンテンツにフォーカス移動' },
    focusHeader: { action: focusHeader, description: 'ヘッダーにフォーカス移動' },
    announceBlock: { action: announceCurrentBlock, description: '現在のブロック情報を読み上げ' },
    headingOutline: { action: announceHeadingOutline, description: '見出し構造を読み上げ' },
    nextBlock: { action: nextBlock, description: '次のブロックへ移動' },
    prevBlock: { action: prevBlock, description: '前のブロックへ移動' },
    nextHeading: { action: nextHeading, description: '次の見出しへジャンプ' },
    prevHeading: { action: prevHeading, description: '前の見出しへジャンプ' },
    nextH1: { action: () => nextHeadingLevel(1), description: '次の見出し1へジャンプ' },
    nextH2: { action: () => nextHeadingLevel(2), description: '次の見出し2へジャンプ' },
    nextH3: { action: () => nextHeadingLevel(3), description: '次の見出し3へジャンプ' },
    firstBlock: { action: firstBlock, description: '最初のブロックへ移動' },
    lastBlock: { action: lastBlock, description: '最後のブロックへ移動' },
    dbGridMode: { action: enterGridMode, description: 'DBグリッドモード' },
    blockActionMenu: { action: openBlockActionMenu, description: 'ブロック操作メニュー' },
    landmarkList: { action: announceLandmarks, description: 'ランドマーク一覧' },
    help: { action: announceHelp, description: 'ヘルプ表示' },
  };

  for (const [name, keyCombo] of Object.entries(shortcuts)) {
    const mapping = actionMap[name];
    if (mapping) {
      bindings.push({
        key: normalizeKeyCombo(keyCombo),
        action: mapping.action,
        description: mapping.description,
      });
    }
  }

  logDebug(MODULE, `Registered ${bindings.length} keyboard shortcuts`);
}

/**
 * Normalize a key combo string like "Alt+Shift+S" to a comparable format.
 */
function normalizeKeyCombo(combo: string): string {
  return combo
    .split('+')
    .map(part => part.trim().toLowerCase())
    .sort()
    .join('+');
}

/**
 * Map KeyboardEvent.code to the base key name used in shortcut strings.
 * On Mac, Option+Shift+key produces composed characters (e.g., "Í" for S),
 * so event.key is unreliable when altKey is true. event.code gives the
 * physical key regardless of modifiers.
 */
function codeToBaseKey(code: string): string | null {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Slash') return '/';
  if (code === 'Home') return 'home';
  if (code === 'End') return 'end';
  return null;
}

/**
 * Build a key combo string from a KeyboardEvent.
 */
function eventToKeyCombo(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.altKey) parts.push('alt');
  if (event.ctrlKey) parts.push('ctrl');
  if (event.metaKey) parts.push('meta');
  if (event.shiftKey) parts.push('shift');

  // On Mac, Option(Alt)+key produces composed characters in event.key.
  // Use event.code to get the physical key when Alt is held.
  let key = event.key.toLowerCase();
  if (event.altKey && event.code) {
    const base = codeToBaseKey(event.code);
    if (base) key = base;
  }

  parts.push(key);
  return parts.sort().join('+');
}

function handleKeydown(event: KeyboardEvent): void {
  // Only handle when Alt+Shift is pressed (our prefix)
  if (!event.altKey || !event.shiftKey) return;

  const combo = eventToKeyCombo(event);

  for (const binding of bindings) {
    if (binding.key === combo) {
      event.preventDefault();
      event.stopPropagation();
      logDebug(MODULE, `Shortcut triggered: ${binding.description}`);
      binding.action();
      return;
    }
  }
}

/**
 * Open the block action menu for the currently focused block.
 * Simulates right-click on the active block to trigger Notion's context menu.
 */
function openBlockActionMenu(): void {
  const active = document.activeElement as HTMLElement | null;
  const block = active?.closest('.notion-selectable[data-block-id]') as HTMLElement | null;

  if (!block) {
    announce('ブロックが選択されていません');
    return;
  }

  // Simulate right-click to open Notion's block context menu
  const rect = block.getBoundingClientRect();
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + 10,
    clientY: rect.top + rect.height / 2,
    button: 2,
  });
  block.dispatchEvent(event);
}

function announceLandmarks(): void {
  const landmarks: string[] = [];

  if (document.querySelector('nav.notion-sidebar-container')) {
    landmarks.push('サイドバー ナビゲーション');
  }
  if (document.querySelector('main.notion-frame')) {
    landmarks.push('メインコンテンツ');
  }
  if (document.querySelector('.notion-topbar, header')) {
    landmarks.push('ヘッダー');
  }
  if (document.querySelector('.notion-peek-renderer')) {
    landmarks.push('サイドピーク');
  }

  if (landmarks.length === 0) {
    announce('ランドマークが見つかりません');
  } else {
    announce(`ランドマーク: ${landmarks.join(', ')}`);
  }
}

function announceHelp(): void {
  const helpLines: string[] = ['Accessible Notion ショートカット:'];
  for (const binding of bindings) {
    const original = Object.entries(currentShortcuts).find(
      ([, v]) => normalizeKeyCombo(v) === binding.key,
    );
    const display = original ? original[1] : binding.key;
    helpLines.push(`${display}: ${binding.description}`);
  }
  announce(helpLines.join('. '));
}

let currentShortcuts: Record<string, string> = {};

/**
 * Initialize the keyboard handler with settings.
 */
export function initKeyboardHandler(settings: ExtensionSettings): void {
  currentShortcuts = { ...settings.shortcuts };
  buildBindings(currentShortcuts);

  document.addEventListener('keydown', handleKeydown, true);
  logDebug(MODULE, 'Keyboard handler initialized');
}

/**
 * Update shortcuts when settings change.
 */
export function updateShortcuts(shortcuts: Record<string, string>): void {
  currentShortcuts = { ...shortcuts };
  buildBindings(currentShortcuts);
}

export function destroyKeyboardHandler(): void {
  document.removeEventListener('keydown', handleKeydown, true);
  bindings.length = 0;
}
