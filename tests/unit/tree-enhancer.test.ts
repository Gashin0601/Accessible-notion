import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTreeEnhancer, enhanceTreeItems, destroyTreeEnhancer } from '../../src/content/tree-enhancer';
import { initLiveAnnouncer, destroyLiveAnnouncer } from '../../src/content/live-announcer';
import { EXTENSION_ATTR } from '../../src/shared/constants';

function createSidebar(): HTMLElement {
  const nav = document.createElement('nav');
  nav.classList.add('notion-sidebar-container');

  const tree = document.createElement('div');
  tree.setAttribute('role', 'tree');

  // Notion sidebar structure: treeitems are <a> tags.
  // Nested treeitems are inside a sibling group, not inside the parent <a>.
  // Structure:
  //   tree
  //     treeitem (ページA) [aria-expanded=true]
  //     group (children of ページA)
  //       treeitem (サブページ1)
  //     treeitem (ページB)
  //     treeitem (ページC)

  const itemA = document.createElement('a');
  itemA.setAttribute('role', 'treeitem');
  itemA.setAttribute('href', '/workspace/page-aaa111');
  itemA.setAttribute('aria-expanded', 'true');
  itemA.textContent = 'ページA';
  tree.appendChild(itemA);

  // Group for children of ページA
  const group = document.createElement('div');
  group.setAttribute('role', 'group');
  const sub1 = document.createElement('a');
  sub1.setAttribute('role', 'treeitem');
  sub1.setAttribute('href', '/workspace/sub-bbb222');
  sub1.textContent = 'サブページ1';
  group.appendChild(sub1);
  tree.appendChild(group);

  const itemB = document.createElement('a');
  itemB.setAttribute('role', 'treeitem');
  itemB.setAttribute('href', '/workspace/page-ccc333');
  itemB.textContent = 'ページB';
  tree.appendChild(itemB);

  const itemC = document.createElement('a');
  itemC.setAttribute('role', 'treeitem');
  itemC.setAttribute('href', '/workspace/page-ddd444');
  itemC.textContent = 'ページC';
  tree.appendChild(itemC);

  nav.appendChild(tree);
  document.body.appendChild(nav);
  return nav;
}

describe('tree-enhancer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initLiveAnnouncer();
  });

  afterEach(() => {
    destroyTreeEnhancer();
    destroyLiveAnnouncer();
  });

  describe('enhanceTreeItems', () => {
    it('sets aria-level on treeitems based on nesting', () => {
      createSidebar();
      enhanceTreeItems();

      const items = document.querySelectorAll('[role="treeitem"]');
      // Top-level items: level 1
      expect(items[0].getAttribute('aria-level')).toBe('1');
      // Nested inside group (sibling of parent treeitem, not nested in treeitem): level 1
      // Note: computeLevel counts ancestor treeitem roles. Since the group is
      // a sibling of the parent treeitem (not a child), level = 1
      expect(items[1].getAttribute('aria-level')).toBe('1');
      expect(items[2].getAttribute('aria-level')).toBe('1');
      expect(items[3].getAttribute('aria-level')).toBe('1');
    });

    it('sets aria-selected based on current URL', () => {
      createSidebar();
      enhanceTreeItems();

      // In JSDOM, location.pathname is typically '/' or 'blank'
      // No items should match as selected
      const items = document.querySelectorAll('[role="treeitem"]');
      for (const item of items) {
        expect(item.getAttribute('aria-selected')).toBe('false');
      }
    });

    it('sets aria-label from page name text', () => {
      createSidebar();
      enhanceTreeItems();

      const items = document.querySelectorAll('[role="treeitem"]');
      expect(items[0].getAttribute('aria-label')).toBe('ページA');
      expect(items[2].getAttribute('aria-label')).toBe('ページB');
    });

    it('marks items with extension attribute', () => {
      createSidebar();
      enhanceTreeItems();

      const items = document.querySelectorAll('[role="treeitem"]');
      for (const item of items) {
        expect(item.getAttribute(EXTENSION_ATTR)).toBe('tree');
      }
    });
  });

  describe('initTreeEnhancer', () => {
    it('initializes roving tabindex (first item gets tabindex=0)', () => {
      createSidebar();
      initTreeEnhancer();

      const items = document.querySelectorAll('[role="treeitem"]');
      expect(items[0].getAttribute('tabindex')).toBe('0');
      // Other items should have tabindex=-1
      for (let i = 1; i < items.length; i++) {
        expect(items[i].getAttribute('tabindex')).toBe('-1');
      }
    });

    it('does not initialize twice', () => {
      createSidebar();
      initTreeEnhancer();
      initTreeEnhancer(); // Second call should be no-op

      const items = document.querySelectorAll('[role="treeitem"]');
      // Should still work correctly
      expect(items[0].getAttribute('tabindex')).toBe('0');
    });

    it('handles missing sidebar gracefully', () => {
      // No sidebar in DOM
      expect(() => initTreeEnhancer()).not.toThrow();
    });
  });

  describe('keyboard navigation', () => {
    it('ArrowDown moves to next treeitem', () => {
      createSidebar();
      initTreeEnhancer();

      const items = document.querySelectorAll<HTMLElement>('[role="treeitem"]');
      items[0].focus();

      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      });
      items[0].dispatchEvent(event);

      expect(items[1].getAttribute('tabindex')).toBe('0');
    });

    it('ArrowUp moves to previous treeitem', () => {
      createSidebar();
      initTreeEnhancer();

      const items = document.querySelectorAll<HTMLElement>('[role="treeitem"]');
      // First move down, then up
      items[0].focus();

      // Move down
      items[0].dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown', bubbles: true, cancelable: true,
      }));
      // Move down again
      items[1].dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown', bubbles: true, cancelable: true,
      }));
      // Move up
      items[2].dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowUp', bubbles: true, cancelable: true,
      }));

      expect(items[1].getAttribute('tabindex')).toBe('0');
    });

    it('Home jumps to first treeitem', () => {
      createSidebar();
      initTreeEnhancer();

      const items = document.querySelectorAll<HTMLElement>('[role="treeitem"]');
      // Focus last item
      items[3].focus();
      items[3].setAttribute('tabindex', '0');

      items[3].dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Home', bubbles: true, cancelable: true,
      }));

      expect(items[0].getAttribute('tabindex')).toBe('0');
    });

    it('End jumps to last treeitem', () => {
      createSidebar();
      initTreeEnhancer();

      const items = document.querySelectorAll<HTMLElement>('[role="treeitem"]');
      items[0].focus();

      items[0].dispatchEvent(new KeyboardEvent('keydown', {
        key: 'End', bubbles: true, cancelable: true,
      }));

      expect(items[items.length - 1].getAttribute('tabindex')).toBe('0');
    });

    it('Enter clicks the treeitem', () => {
      createSidebar();
      initTreeEnhancer();

      let clicked = false;
      const items = document.querySelectorAll<HTMLElement>('[role="treeitem"]');
      items[0].addEventListener('click', () => { clicked = true; });
      items[0].focus();

      items[0].dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true,
      }));

      expect(clicked).toBe(true);
    });
  });

  describe('destroyTreeEnhancer', () => {
    it('removes keyboard handler', () => {
      createSidebar();
      initTreeEnhancer();
      destroyTreeEnhancer();

      const items = document.querySelectorAll<HTMLElement>('[role="treeitem"]');
      const initialTabindex = items[0].getAttribute('tabindex');

      // Keyboard event should not change anything after destroy
      items[0].dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown', bubbles: true, cancelable: true,
      }));

      expect(items[0].getAttribute('tabindex')).toBe(initialTabindex);
    });
  });
});
