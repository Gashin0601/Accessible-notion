import { describe, it, expect, beforeEach } from 'vitest';
import { detectBlockType, getBlockText, BLOCK_TYPE_MAP } from '../../src/content/selectors';

describe('selectors', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('detectBlockType', () => {
    it('detects text-block from CSS class', () => {
      const el = document.createElement('div');
      el.classList.add('notion-selectable', 'notion-text-block');
      expect(detectBlockType(el)).toBe('text-block');
    });

    it('detects header-block', () => {
      const el = document.createElement('div');
      el.classList.add('notion-selectable', 'notion-header-block');
      expect(detectBlockType(el)).toBe('header-block');
    });

    it('detects sub_header-block', () => {
      const el = document.createElement('div');
      el.classList.add('notion-selectable', 'notion-sub_header-block');
      expect(detectBlockType(el)).toBe('sub_header-block');
    });

    it('detects toggle-block', () => {
      const el = document.createElement('div');
      el.classList.add('notion-selectable', 'notion-toggle-block');
      expect(detectBlockType(el)).toBe('toggle-block');
    });

    it('detects callout-block', () => {
      const el = document.createElement('div');
      el.classList.add('notion-selectable', 'notion-callout-block');
      expect(detectBlockType(el)).toBe('callout-block');
    });

    it('detects collection_view-block', () => {
      const el = document.createElement('div');
      el.classList.add('notion-selectable', 'notion-collection_view-block');
      expect(detectBlockType(el)).toBe('collection_view-block');
    });

    it('detects divider-block', () => {
      const el = document.createElement('div');
      el.classList.add('notion-selectable', 'notion-divider-block');
      expect(detectBlockType(el)).toBe('divider-block');
    });

    it('detects page-block', () => {
      const el = document.createElement('div');
      el.classList.add('notion-selectable', 'notion-page-block');
      expect(detectBlockType(el)).toBe('page-block');
    });

    it('returns null for unknown class', () => {
      const el = document.createElement('div');
      el.classList.add('notion-selectable', 'notion-unknown-block');
      expect(detectBlockType(el)).toBeNull();
    });

    it('returns null for element without notion block class', () => {
      const el = document.createElement('div');
      el.classList.add('some-other-class');
      expect(detectBlockType(el)).toBeNull();
    });
  });

  describe('getBlockText', () => {
    it('returns text content of a textbox inside the block', () => {
      const block = document.createElement('div');
      const textbox = document.createElement('div');
      textbox.setAttribute('role', 'textbox');
      textbox.setAttribute('contenteditable', 'true');
      textbox.textContent = 'Hello world';
      block.appendChild(textbox);

      expect(getBlockText(block)).toBe('Hello world');
    });

    it('truncates long text with ellipsis', () => {
      const block = document.createElement('div');
      const textbox = document.createElement('div');
      textbox.setAttribute('role', 'textbox');
      textbox.setAttribute('contenteditable', 'true');
      textbox.textContent = 'A'.repeat(100);
      block.appendChild(textbox);

      const result = getBlockText(block, 50);
      expect(result).toHaveLength(51); // 50 chars + "…"
      expect(result.endsWith('…')).toBe(true);
    });

    it('returns empty string for empty block', () => {
      const block = document.createElement('div');
      expect(getBlockText(block)).toBe('');
    });

    it('falls back to block textContent if no textbox', () => {
      const block = document.createElement('div');
      block.textContent = 'Fallback text';
      expect(getBlockText(block)).toBe('Fallback text');
    });
  });

  describe('BLOCK_TYPE_MAP completeness', () => {
    it('has both Japanese and English descriptions for every type', () => {
      for (const [key, info] of Object.entries(BLOCK_TYPE_MAP)) {
        expect(info.description, `${key} should have Japanese description`).toBeTruthy();
        expect(info.descriptionEn, `${key} should have English description`).toBeTruthy();
        expect(info.role, `${key} should have a role`).toBeTruthy();
      }
    });
  });
});
