import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initSearchEnhancer, destroySearchEnhancer } from '../../src/content/search-enhancer';
import { initLiveAnnouncer, destroyLiveAnnouncer } from '../../src/content/live-announcer';
import { EXTENSION_ATTR } from '../../src/shared/constants';

function createSearchDialog(resultTitles: string[]): HTMLElement {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');

  // Search input
  const input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('placeholder', '検索...');
  dialog.appendChild(input);

  // Results container
  const results = document.createElement('div');
  results.classList.add('search-results');

  for (let i = 0; i < resultTitles.length; i++) {
    const item = document.createElement('div');
    item.classList.add('search-result');
    // Mock offsetHeight and offsetParent for visibility filter
    Object.defineProperty(item, 'offsetHeight', { value: 40, configurable: true });
    Object.defineProperty(item, 'offsetParent', { value: document.body, configurable: true });

    const title = document.createElement('span');
    title.classList.add('title');
    title.textContent = resultTitles[i];
    item.appendChild(title);

    results.appendChild(item);
  }

  dialog.appendChild(results);
  return dialog;
}

describe('search-enhancer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initLiveAnnouncer();
    initSearchEnhancer();
  });

  afterEach(() => {
    destroySearchEnhancer();
    destroyLiveAnnouncer();
  });

  describe('search dialog detection', () => {
    it('enhances dialog with input as search dialog', async () => {
      const dialog = createSearchDialog(['ページ1', 'ページ2']);
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      expect(dialog.getAttribute(EXTENSION_ATTR)).toBe('search');
    });

    it('sets aria-label to 検索', async () => {
      const dialog = createSearchDialog(['ページ1']);
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      expect(dialog.getAttribute('aria-label')).toBe('検索');
    });

    it('does not enhance dialogs without input', async () => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.textContent = 'No search here';
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      expect(dialog.getAttribute(EXTENSION_ATTR)).toBeNull();
    });
  });

  describe('result enhancement', () => {
    it('sets listbox role on results container', async () => {
      const dialog = createSearchDialog(['ページ1', 'ページ2', 'ページ3']);
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      const resultsList = dialog.querySelector('.search-results');
      expect(resultsList?.getAttribute('role')).toBe('listbox');
      expect(resultsList?.getAttribute('aria-label')).toBe('検索結果');
    });

    it('sets option role on result items', async () => {
      const dialog = createSearchDialog(['ページ1', 'ページ2']);
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      const items = dialog.querySelectorAll('.search-result');
      for (const item of items) {
        expect(item.getAttribute('role')).toBe('option');
      }
    });

    it('assigns unique IDs to result items', async () => {
      const dialog = createSearchDialog(['ページ1', 'ページ2', 'ページ3']);
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      const items = dialog.querySelectorAll('.search-result');
      const ids = new Set<string>();
      for (const item of items) {
        expect(item.id).toBeTruthy();
        ids.add(item.id);
      }
      // All IDs should be unique
      expect(ids.size).toBe(items.length);
    });

    it('sets aria-label from title text', async () => {
      const dialog = createSearchDialog(['議事録ページ', 'タスク一覧']);
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      const items = dialog.querySelectorAll('.search-result');
      expect(items[0].getAttribute('aria-label')).toBe('議事録ページ');
      expect(items[1].getAttribute('aria-label')).toBe('タスク一覧');
    });

    it('sets tabindex=-1 on result items', async () => {
      const dialog = createSearchDialog(['ページ1']);
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      const item = dialog.querySelector('.search-result');
      expect(item?.getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('result count announcement', () => {
    it('announces result count', async () => {
      const dialog = createSearchDialog(['ページ1', 'ページ2', 'ページ3']);
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => requestAnimationFrame(r));

      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toBe('3件の結果');
    });
  });

  describe('dialog cleanup', () => {
    it('cleans up when search dialog is removed', async () => {
      const dialog = createSearchDialog(['ページ1']);
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      expect(dialog.getAttribute(EXTENSION_ATTR)).toBe('search');

      dialog.remove();
      await new Promise((r) => setTimeout(r, 100));

      // Should not throw
      expect(document.querySelectorAll(`[${EXTENSION_ATTR}="search"]`).length).toBe(0);
    });
  });

  describe('destroySearchEnhancer', () => {
    it('disconnects observer and cleans up', () => {
      expect(() => destroySearchEnhancer()).not.toThrow();
    });
  });
});
