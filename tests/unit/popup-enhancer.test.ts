import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initPopupEnhancer, destroyPopupEnhancer } from '../../src/content/popup-enhancer';
import { initLiveAnnouncer, destroyLiveAnnouncer } from '../../src/content/live-announcer';

function createSlashCommandPopup(): HTMLElement {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');

  const listbox = document.createElement('div');
  listbox.setAttribute('role', 'listbox');

  // Category group
  const group = document.createElement('div');
  const header = document.createElement('div');
  header.textContent = '基本';
  group.appendChild(header);

  const options = ['テキスト', '見出し1', '見出し2', 'リスト'];
  for (const text of options) {
    const opt = document.createElement('div');
    opt.setAttribute('role', 'option');
    opt.textContent = text;
    group.appendChild(opt);
  }

  listbox.appendChild(group);
  dialog.appendChild(listbox);
  return dialog;
}

function createBlockActionPopup(): HTMLElement {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');

  const items = ['削除', '複製', 'ブロックタイプの変更', 'コメント'];
  for (const text of items) {
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    item.textContent = text;
    dialog.appendChild(item);
  }

  return dialog;
}

function createColorPickerPopup(): HTMLElement {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');

  const listbox = document.createElement('div');
  listbox.setAttribute('role', 'listbox');

  const colors = ['デフォルト', 'グレー', 'ブラウン', '赤', 'オレンジ'];
  for (const text of colors) {
    const opt = document.createElement('div');
    opt.setAttribute('role', 'option');
    opt.textContent = text;
    listbox.appendChild(opt);
  }

  dialog.appendChild(listbox);
  return dialog;
}

function createMentionPopup(): HTMLElement {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');

  const listbox = document.createElement('div');
  listbox.setAttribute('role', 'listbox');

  const users = ['鈴木太郎', '田中花子', '佐藤次郎'];
  for (const text of users) {
    const opt = document.createElement('div');
    opt.setAttribute('role', 'option');
    opt.textContent = text;
    listbox.appendChild(opt);
  }

  dialog.appendChild(listbox);
  return dialog;
}

function createInlineToolbar(): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.classList.add('notion-text-action-menu');

  // Create toolbar buttons
  const buttons = [
    { svg: 'textBoldSmall', text: '' },
    { svg: 'textItalicSmall', text: '' },
    { svg: 'linkSmall', text: '' },
    { svg: null, text: 'テキスト' },
  ];

  for (const config of buttons) {
    const btn = document.createElement('div');
    btn.setAttribute('role', 'button');
    // Mock getBoundingClientRect for non-zero size
    Object.defineProperty(btn, 'getBoundingClientRect', {
      value: () => ({ width: 32, height: 32, top: 0, left: 0, bottom: 32, right: 32 }),
    });

    if (config.svg) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', config.svg);
      btn.appendChild(svg);
    }
    if (config.text) {
      btn.textContent = config.text;
      btn.setAttribute('aria-haspopup', 'dialog');
    }

    toolbar.appendChild(btn);
  }

  return toolbar;
}

describe('popup-enhancer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initLiveAnnouncer();
    initPopupEnhancer();
  });

  afterEach(() => {
    destroyPopupEnhancer();
    destroyLiveAnnouncer();
  });

  describe('slash command popup', () => {
    it('enhances slash command dialog with proper label', async () => {
      const dialog = createSlashCommandPopup();
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      expect(dialog.getAttribute('aria-label')).toBe('スラッシュコマンド');
    });

    it('sets aria-label on listbox', async () => {
      const dialog = createSlashCommandPopup();
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      const listbox = dialog.querySelector('[role="listbox"]');
      expect(listbox?.getAttribute('aria-label')).toBe('スラッシュコマンド');
    });

    it('ensures options have IDs', async () => {
      const dialog = createSlashCommandPopup();
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      const options = dialog.querySelectorAll('[role="option"]');
      for (const opt of options) {
        expect(opt.id).toBeTruthy();
      }
    });

    it('sets aria-selected=false on options', async () => {
      const dialog = createSlashCommandPopup();
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      const options = dialog.querySelectorAll('[role="option"]');
      for (const opt of options) {
        expect(opt.getAttribute('aria-selected')).toBe('false');
      }
    });

    it('adds group role and label to category sections', async () => {
      const dialog = createSlashCommandPopup();
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      const groups = dialog.querySelectorAll('[role="group"]');
      expect(groups.length).toBeGreaterThanOrEqual(1);
      expect(groups[0].getAttribute('aria-label')).toBe('基本');
    });
  });

  describe('block action popup', () => {
    it('enhances block action dialog', async () => {
      const dialog = createBlockActionPopup();
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      expect(dialog.getAttribute('aria-label')).toBe('ブロック操作');
    });

    it('sets aria-label on menu items', async () => {
      const dialog = createBlockActionPopup();
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      const items = dialog.querySelectorAll('[role="menuitem"]');
      expect(items[0].getAttribute('aria-label')).toBe('削除');
      expect(items[1].getAttribute('aria-label')).toBe('複製');
    });
  });

  describe('color picker popup', () => {
    it('enhances color picker dialog', async () => {
      const dialog = createColorPickerPopup();
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      expect(dialog.getAttribute('aria-label')).toBe('カラーピッカー');
    });

    it('sets aria-label on listbox', async () => {
      const dialog = createColorPickerPopup();
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      const listbox = dialog.querySelector('[role="listbox"]');
      expect(listbox?.getAttribute('aria-label')).toBe('カラーオプション');
    });
  });

  describe('mention popup', () => {
    it('enhances mention dialog', async () => {
      const dialog = createMentionPopup();
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      expect(dialog.getAttribute('aria-label')).toBe('メンション');
    });
  });

  describe('inline toolbar', () => {
    it('enhances toolbar with role=toolbar', async () => {
      const toolbar = createInlineToolbar();
      document.body.appendChild(toolbar);

      await new Promise((r) => setTimeout(r, 100));

      expect(toolbar.getAttribute('role')).toBe('toolbar');
      expect(toolbar.getAttribute('aria-label')).toBe('テキスト書式設定ツールバー');
    });

    it('labels SVG-based buttons', async () => {
      const toolbar = createInlineToolbar();
      document.body.appendChild(toolbar);

      await new Promise((r) => setTimeout(r, 100));

      const buttons = toolbar.querySelectorAll('[role="button"]');
      // textBoldSmall button
      expect(buttons[0].getAttribute('aria-label')).toBe('太字 (Ctrl+B)');
      // textItalicSmall button
      expect(buttons[1].getAttribute('aria-label')).toBe('イタリック (Ctrl+I)');
      // linkSmall button
      expect(buttons[2].getAttribute('aria-label')).toBe('リンク (Ctrl+K)');
    });

    it('labels dropdown buttons with block type', async () => {
      const toolbar = createInlineToolbar();
      document.body.appendChild(toolbar);

      await new Promise((r) => setTimeout(r, 100));

      const buttons = toolbar.querySelectorAll('[role="button"]');
      // Last button has text "テキスト" and aria-haspopup
      expect(buttons[3].getAttribute('aria-label')).toBe('ブロックタイプ: テキスト');
    });
  });

  describe('popup removal', () => {
    it('cleans up when popup is removed', async () => {
      const dialog = createSlashCommandPopup();
      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      // Remove the dialog
      dialog.remove();

      await new Promise((r) => setTimeout(r, 100));

      // Should not throw or leave orphan state
      expect(document.querySelectorAll('[role="dialog"]').length).toBe(0);
    });
  });

  describe('skips search dialogs', () => {
    it('does not enhance dialogs already marked as search', async () => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('data-accessible-notion', 'search');

      const listbox = document.createElement('div');
      listbox.setAttribute('role', 'listbox');
      dialog.appendChild(listbox);

      document.body.appendChild(dialog);

      await new Promise((r) => setTimeout(r, 100));

      // Should not have popup marker
      expect(dialog.hasAttribute('data-accessible-notion-popup')).toBe(false);
    });
  });

  describe('destroyPopupEnhancer', () => {
    it('cleans up observer and sync timer', () => {
      expect(() => destroyPopupEnhancer()).not.toThrow();
    });
  });
});
