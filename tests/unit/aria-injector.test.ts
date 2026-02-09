import { describe, it, expect, beforeEach } from 'vitest';
import { enhanceBlock, enhanceTextbox, enhanceImage, scanAndEnhance } from '../../src/content/aria-injector';
import { initLiveAnnouncer, destroyLiveAnnouncer } from '../../src/content/live-announcer';

describe('aria-injector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initLiveAnnouncer();
  });

  afterEach(() => {
    destroyLiveAnnouncer();
  });

  describe('enhanceBlock', () => {
    it('adds role and aria-roledescription to text block', () => {
      const block = document.createElement('div');
      block.classList.add('notion-selectable', 'notion-text-block');
      block.setAttribute('data-block-id', 'test-1');
      const textbox = document.createElement('div');
      textbox.setAttribute('role', 'textbox');
      textbox.setAttribute('contenteditable', 'true');
      textbox.textContent = 'テストテキスト';
      block.appendChild(textbox);
      document.body.appendChild(block);

      enhanceBlock(block);

      expect(block.getAttribute('role')).toBe('group');
      expect(block.getAttribute('aria-roledescription')).toBe('テキストブロック');
      expect(block.getAttribute('aria-label')).toContain('テストテキスト');
      expect(block.getAttribute('tabindex')).toBe('-1');
    });

    it('adds role for header block with correct description', () => {
      const block = document.createElement('div');
      block.classList.add('notion-selectable', 'notion-header-block');
      block.setAttribute('data-block-id', 'test-2');
      block.textContent = '見出しタイトル';
      document.body.appendChild(block);

      enhanceBlock(block);

      expect(block.getAttribute('aria-roledescription')).toBe('見出し1ブロック');
    });

    it('adds separator role for divider block', () => {
      const block = document.createElement('div');
      block.classList.add('notion-selectable', 'notion-divider-block');
      block.setAttribute('data-block-id', 'test-3');
      document.body.appendChild(block);

      enhanceBlock(block);

      expect(block.getAttribute('role')).toBe('separator');
    });

    it('labels empty block with (空)', () => {
      const block = document.createElement('div');
      block.classList.add('notion-selectable', 'notion-text-block');
      block.setAttribute('data-block-id', 'test-4');
      document.body.appendChild(block);

      enhanceBlock(block);

      expect(block.getAttribute('aria-label')).toContain('(空)');
    });

    it('does not overwrite existing role', () => {
      const block = document.createElement('div');
      block.classList.add('notion-selectable', 'notion-text-block');
      block.setAttribute('data-block-id', 'test-5');
      block.setAttribute('role', 'article');
      document.body.appendChild(block);

      enhanceBlock(block);

      expect(block.getAttribute('role')).toBe('article');
    });
  });

  describe('enhanceTextbox', () => {
    it('adds aria-label from content', () => {
      const block = document.createElement('div');
      block.classList.add('notion-selectable', 'notion-text-block');
      block.setAttribute('data-block-id', 'test-6');
      const textbox = document.createElement('div');
      textbox.setAttribute('role', 'textbox');
      textbox.setAttribute('contenteditable', 'true');
      textbox.textContent = 'サンプルテキスト';
      block.appendChild(textbox);
      document.body.appendChild(block);

      enhanceTextbox(textbox);

      expect(textbox.getAttribute('aria-label')).toContain('テキストブロック');
      expect(textbox.getAttribute('aria-label')).toContain('サンプルテキスト');
    });

    it('uses placeholder when content is empty', () => {
      const block = document.createElement('div');
      block.classList.add('notion-selectable', 'notion-text-block');
      block.setAttribute('data-block-id', 'test-7');
      const textbox = document.createElement('div');
      textbox.setAttribute('role', 'textbox');
      textbox.setAttribute('contenteditable', 'true');
      textbox.setAttribute('placeholder', '新規テキスト');
      block.appendChild(textbox);
      document.body.appendChild(block);

      enhanceTextbox(textbox);

      expect(textbox.getAttribute('aria-label')).toContain('新規テキスト');
    });
  });

  describe('enhanceImage', () => {
    it('adds default alt text when none exists', () => {
      const img = document.createElement('img');
      document.body.appendChild(img);

      enhanceImage(img);

      expect(img.alt).toBe('画像');
    });

    it('does not overwrite existing alt text', () => {
      const img = document.createElement('img');
      img.alt = 'My photo';
      document.body.appendChild(img);

      enhanceImage(img);

      expect(img.alt).toBe('My photo');
    });

    it('uses caption text when available', () => {
      const container = document.createElement('div');
      container.classList.add('notion-image-block');
      const img = document.createElement('img');
      const caption = document.createElement('figcaption');
      caption.textContent = 'キャプション説明';
      container.appendChild(img);
      container.appendChild(caption);
      document.body.appendChild(container);

      enhanceImage(img);

      expect(img.alt).toBe('キャプション説明');
    });
  });

  describe('scanAndEnhance', () => {
    it('enhances multiple blocks in one pass', () => {
      // Create multiple blocks
      for (let i = 0; i < 3; i++) {
        const block = document.createElement('div');
        block.classList.add('notion-selectable', 'notion-text-block');
        block.setAttribute('data-block-id', `block-${i}`);
        block.textContent = `Block ${i}`;
        document.body.appendChild(block);
      }

      const count = scanAndEnhance();

      expect(count).toBeGreaterThanOrEqual(3);
      const blocks = document.querySelectorAll('[aria-roledescription]');
      expect(blocks.length).toBe(3);
    });
  });
});
