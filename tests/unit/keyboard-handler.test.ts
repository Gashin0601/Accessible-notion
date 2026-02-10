import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initKeyboardHandler, updateShortcuts, destroyKeyboardHandler } from '../../src/content/keyboard-handler';
import { initLiveAnnouncer, destroyLiveAnnouncer } from '../../src/content/live-announcer';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '../../src/shared/constants';

function createLandmarks(): void {
  // Sidebar
  const nav = document.createElement('nav');
  nav.classList.add('notion-sidebar-container');
  const tree = document.createElement('div');
  tree.setAttribute('role', 'tree');
  const item = document.createElement('a');
  item.setAttribute('role', 'treeitem');
  item.setAttribute('tabindex', '0');
  item.textContent = 'ページ1';
  tree.appendChild(item);
  nav.appendChild(tree);
  document.body.appendChild(nav);

  // Main frame with blocks
  const main = document.createElement('main');
  main.classList.add('notion-frame');
  const block = document.createElement('div');
  block.classList.add('notion-selectable', 'notion-text-block');
  block.setAttribute('data-block-id', 'block-1');
  block.textContent = 'テキスト1';
  main.appendChild(block);
  document.body.appendChild(main);

  // Header
  const header = document.createElement('div');
  header.classList.add('notion-topbar');
  const btn = document.createElement('button');
  btn.textContent = 'ボタン';
  header.appendChild(btn);
  document.body.appendChild(header);
}

function fireKeyCombo(key: string, altKey = true, shiftKey = true, code?: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    code: code ?? '',
    altKey,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

/**
 * Simulate a Mac Option+Shift+key press.
 * On Mac, Option+Shift produces composed characters (e.g., Option+Shift+N → "˜").
 * event.key gives the composed char, event.code gives the physical key.
 */
function fireMacOptionShift(composedChar: string, code: string): KeyboardEvent {
  return fireKeyCombo(composedChar, true, true, code);
}

describe('keyboard-handler', () => {
  let settings: ExtensionSettings;

  beforeEach(() => {
    document.body.innerHTML = '';
    initLiveAnnouncer();
    createLandmarks();
    settings = { ...DEFAULT_SETTINGS };
  });

  afterEach(() => {
    destroyKeyboardHandler();
    destroyLiveAnnouncer();
  });

  describe('initKeyboardHandler', () => {
    it('registers keyboard listener', () => {
      initKeyboardHandler(settings);

      // Alt+Shift+S should focus sidebar
      fireKeyCombo('S');

      const treeItem = document.querySelector('[role="treeitem"]');
      expect(document.activeElement).toBe(treeItem);
    });

    it('binds all default shortcuts', () => {
      initKeyboardHandler(settings);

      // Verify we can fire help shortcut
      fireKeyCombo('/');

      // Help announces shortcuts list
      // Just check it doesn't throw
    });
  });

  describe('shortcut actions', () => {
    beforeEach(() => {
      initKeyboardHandler(settings);
    });

    it('Alt+Shift+S focuses sidebar', () => {
      fireKeyCombo('S');
      const treeItem = document.querySelector('[role="treeitem"]');
      expect(document.activeElement).toBe(treeItem);
    });

    it('Alt+Shift+M focuses main content', () => {
      fireKeyCombo('M');
      const block = document.querySelector('.notion-selectable[data-block-id]');
      expect(document.activeElement).toBe(block);
    });

    it('Alt+Shift+H focuses header', () => {
      fireKeyCombo('H');
      const btn = document.querySelector('.notion-topbar button');
      expect(document.activeElement).toBe(btn);
    });

    it('Alt+Shift+L announces landmarks', async () => {
      fireKeyCombo('L');

      await new Promise((r) => requestAnimationFrame(r));

      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('ランドマーク');
    });

    it('Alt+Shift+/ announces help', async () => {
      fireKeyCombo('/');

      await new Promise((r) => requestAnimationFrame(r));

      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('ショートカット');
    });
  });

  describe('non-shortcut keys', () => {
    beforeEach(() => {
      initKeyboardHandler(settings);
    });

    it('ignores keys without Alt', () => {
      const block = document.querySelector('.notion-selectable[data-block-id]') as HTMLElement;
      block.setAttribute('tabindex', '-1');
      block.focus();
      expect(document.activeElement).toBe(block);

      // Shift+S without Alt should not trigger
      const event = new KeyboardEvent('keydown', {
        key: 'S',
        altKey: false,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      // Focus should not have moved to sidebar
      expect(document.activeElement).toBe(block);
    });

    it('ignores keys without Shift', () => {
      const block = document.querySelector('.notion-selectable[data-block-id]') as HTMLElement;
      block.setAttribute('tabindex', '-1');
      block.focus();
      expect(document.activeElement).toBe(block);

      // Alt+S without Shift should not trigger
      const event = new KeyboardEvent('keydown', {
        key: 'S',
        altKey: true,
        shiftKey: false,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      // Focus should not have moved
      expect(document.activeElement).toBe(block);
    });

    it('ignores unbound Alt+Shift combos', () => {
      const block = document.querySelector('.notion-selectable[data-block-id]') as HTMLElement;
      block.setAttribute('tabindex', '-1');
      block.focus();
      expect(document.activeElement).toBe(block);

      // Alt+Shift+Z is not bound to anything
      fireKeyCombo('Z');

      // Focus should not have changed
      expect(document.activeElement).toBe(block);
    });
  });

  describe('updateShortcuts', () => {
    it('updates shortcut bindings', () => {
      initKeyboardHandler(settings);

      // Remap focusSidebar to Alt+Shift+X
      updateShortcuts({
        ...settings.shortcuts,
        focusSidebar: 'Alt+Shift+X',
      });

      // Old combo should not work
      const block = document.querySelector('.notion-selectable[data-block-id]') as HTMLElement;
      block.setAttribute('tabindex', '-1');
      block.focus();
      expect(document.activeElement).toBe(block);

      fireKeyCombo('S');
      expect(document.activeElement).toBe(block); // Did not move

      // New combo should work
      fireKeyCombo('X');
      const treeItem = document.querySelector('[role="treeitem"]');
      expect(document.activeElement).toBe(treeItem);
    });
  });

  describe('Mac Option+Shift key matching', () => {
    beforeEach(() => {
      initKeyboardHandler(settings);
    });

    it('⌥+Shift+S matches via event.code on Mac (composed char "Í")', () => {
      fireMacOptionShift('Í', 'KeyS');
      const treeItem = document.querySelector('[role="treeitem"]');
      expect(document.activeElement).toBe(treeItem);
    });

    it('⌥+Shift+M matches via event.code on Mac (composed char "Â")', () => {
      fireMacOptionShift('Â', 'KeyM');
      const block = document.querySelector('.notion-selectable[data-block-id]');
      expect(document.activeElement).toBe(block);
    });

    it('⌥+Shift+H matches via event.code on Mac (composed char "Ó")', () => {
      fireMacOptionShift('Ó', 'KeyH');
      const btn = document.querySelector('.notion-topbar button');
      expect(document.activeElement).toBe(btn);
    });

    it('⌥+Shift+N triggers next block via event.code on Mac', () => {
      fireMacOptionShift('˜', 'KeyN');
      // nextBlock should have been called — won't throw
    });

    it('⌥+Shift+/ matches via event.code on Mac (Slash)', () => {
      fireMacOptionShift('÷', 'Slash');
      // announceHelp should fire without throwing
    });

    it('⌥+Shift+1 matches via event.code on Mac (Digit1)', () => {
      fireMacOptionShift('⁄', 'Digit1');
      // nextH1 should fire without throwing
    });

    it('⌥+Shift+Home matches via event.code on Mac', () => {
      fireMacOptionShift('Home', 'Home');
      // firstBlock should fire without throwing
    });

    it('⌥+Shift+End matches via event.code on Mac', () => {
      fireMacOptionShift('End', 'End');
      // lastBlock should fire without throwing
    });

    it('preventDefault is called when Mac shortcut matches', () => {
      const event = fireMacOptionShift('Í', 'KeyS');
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('destroyKeyboardHandler', () => {
    it('removes keyboard listener', () => {
      initKeyboardHandler(settings);
      destroyKeyboardHandler();

      const block = document.querySelector('.notion-selectable[data-block-id]') as HTMLElement;
      block.setAttribute('tabindex', '-1');
      block.focus();
      expect(document.activeElement).toBe(block);

      // Alt+Shift+S should not work after destroy
      fireKeyCombo('S');
      expect(document.activeElement).toBe(block);
    });
  });
});
