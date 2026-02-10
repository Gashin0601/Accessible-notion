/**
 * Centralized Notion DOM selectors.
 *
 * ALL selectors used to find Notion elements MUST be defined here.
 * When Notion changes its DOM, only this file needs to be updated.
 */

// ─── Landmarks ───────────────────────────────────────────────
export const SIDEBAR_NAV = 'nav.notion-sidebar-container';
export const MAIN_FRAME = 'main.notion-frame';
export const HEADER = '.notion-topbar';
export const SKIP_LINK = 'a[href="#main"]';
export const NOTION_APP = '#notion-app';
export const NOTION_APP_INNER = '.notion-app-inner';

// ─── Sidebar / Tree ─────────────────────────────────────────
export const TREE = '[role="tree"]';
export const TREE_ITEM = '[role="treeitem"]';
export const TREE_ITEM_LINK = '[role="treeitem"] > a, [role="treeitem"] a[href]';
export const SIDEBAR_SECTION_HEADER = `${SIDEBAR_NAV} button[style*="font-weight"]`;

// ─── Blocks (content area) ───────────────────────────────────
export const BLOCK_SELECTABLE = 'div.notion-selectable[data-block-id]';

/** Map of Notion block CSS class suffix → human-readable type */
export const BLOCK_TYPE_MAP: Record<string, BlockTypeInfo> = {
  'text-block':          { role: 'group', description: 'テキストブロック', descriptionEn: 'Text block' },
  'header-block':        { role: 'heading', description: '見出し1', descriptionEn: 'Heading 1', ariaLevel: 1 },
  'sub_header-block':    { role: 'heading', description: '見出し2', descriptionEn: 'Heading 2', ariaLevel: 2 },
  'sub_sub_header-block':{ role: 'heading', description: '見出し3', descriptionEn: 'Heading 3', ariaLevel: 3 },
  'bulleted_list-block': { role: 'listitem', description: '箇条書き', descriptionEn: 'Bulleted list item' },
  'numbered_list-block': { role: 'listitem', description: '番号付きリスト', descriptionEn: 'Numbered list item' },
  'to_do-block':         { role: 'checkbox', description: 'チェックボックス', descriptionEn: 'To-do checkbox' },
  'toggle-block':        { role: 'button', description: 'トグル', descriptionEn: 'Toggle' },
  'callout-block':       { role: 'note', description: 'コールアウトブロック', descriptionEn: 'Callout block' },
  'quote-block':         { role: 'blockquote', description: '引用', descriptionEn: 'Quote' },
  'code-block':          { role: 'code', description: 'コード', descriptionEn: 'Code block' },
  'image-block':         { role: 'figure', description: '画像ブロック', descriptionEn: 'Image block' },
  'video-block':         { role: 'figure', description: '動画ブロック', descriptionEn: 'Video block' },
  'embed-block':         { role: 'figure', description: '埋め込みブロック', descriptionEn: 'Embed block' },
  'bookmark-block':      { role: 'group', description: 'ブックマークブロック', descriptionEn: 'Bookmark block' },
  'divider-block':       { role: 'separator', description: '区切り線', descriptionEn: 'Divider' },
  'page-block':          { role: 'link', description: 'ページリンク', descriptionEn: 'Page link' },
  'column_list-block':   { role: 'group', description: 'カラムレイアウト', descriptionEn: 'Column layout' },
  'column-block':        { role: 'group', description: 'カラム', descriptionEn: 'Column' },
  'table-block':         { role: 'table', description: 'シンプルテーブル', descriptionEn: 'Simple table' },
  'table_row-block':     { role: 'row', description: 'テーブル行', descriptionEn: 'Table row' },
  'collection_view-block': { role: 'region', description: 'データベース', descriptionEn: 'Database' },
  'collection_view_page-block': { role: 'region', description: 'データベースページ', descriptionEn: 'Database page' },
  'equation-block':      { role: 'math', description: '数式ブロック', descriptionEn: 'Equation block' },
  'file-block':          { role: 'group', description: 'ファイルブロック', descriptionEn: 'File block' },
  'pdf-block':           { role: 'figure', description: 'PDFブロック', descriptionEn: 'PDF block' },
  'audio-block':         { role: 'group', description: 'オーディオブロック', descriptionEn: 'Audio block' },
  'synced_block-block':  { role: 'group', description: '同期ブロック', descriptionEn: 'Synced block' },
  'table_of_contents-block': { role: 'navigation', description: '目次', descriptionEn: 'Table of contents' },
  'breadcrumb-block':    { role: 'navigation', description: 'パンくずリスト', descriptionEn: 'Breadcrumb' },
  'alias-block':         { role: 'link', description: 'ページリンク', descriptionEn: 'Page link' },
  'button-block':        { role: 'button', description: 'ボタン', descriptionEn: 'Button' },
};

export interface BlockTypeInfo {
  role: string;
  description: string;
  descriptionEn: string;
  ariaLevel?: number;
}

// ─── Editable content ────────────────────────────────────────
export const TEXTBOX = '[role="textbox"][contenteditable="true"]';
export const PLACEHOLDER = '[placeholder]';

// ─── Database views ──────────────────────────────────────────
export const DB_COLLECTION_VIEW = '.notion-collection_view-block';
export const DB_TABLE_VIEW = '.notion-table-view';
export const DB_BOARD_VIEW = '.notion-board-view';
export const DB_CALENDAR_VIEW = '.notion-calendar-view';
export const DB_GALLERY_VIEW = '.notion-gallery-view';
export const DB_LIST_VIEW = '.notion-list-view';
export const DB_TIMELINE_VIEW = '.notion-timeline-view';

// ─── Toggle / Disclosure ─────────────────────────────────────
export const TOGGLE_BLOCK = '.notion-selectable.notion-toggle-block';
export const TOGGLE_BUTTON = '.notion-toggle-block > div:first-child';

// ─── Search ──────────────────────────────────────────────────
export const SEARCH_MODAL = '[role="dialog"]';
export const SEARCH_INPUT = '.notion-search-input input, [role="dialog"] input[type="text"]';

// ─── Comments ────────────────────────────────────────────────
export const SIDE_PEEK = '.notion-peek-renderer';
export const COMMENT_THREAD = '.notion-comment-thread';

// ─── Modals ──────────────────────────────────────────────────
export const MODAL_OVERLAY = '.notion-overlay-container [role="dialog"]';

// ─── Live regions (Notion's own) ─────────────────────────────
export const NOTION_STATUS = '[role="status"][aria-live]';
export const NOTION_ALERT = '[role="alert"][aria-live]';

// ─── Misc ────────────────────────────────────────────────────
export const TOPBAR_BREADCRUMB = '.shadow-cursor-breadcrumb, .notion-topbar-breadcrumb';
export const HOVER_ONLY_CONTROLS = '.notion-selectable > [style*="opacity: 0"], .notion-block-handle';

/**
 * Detect block type from a .notion-selectable element's CSS classes.
 * Returns the matching key from BLOCK_TYPE_MAP, or null.
 */
export function detectBlockType(element: Element): string | null {
  for (const className of element.classList) {
    const match = className.match(/^notion-(.+)-block$/);
    if (match) {
      const key = match[1] + '-block';
      if (key in BLOCK_TYPE_MAP) {
        return key;
      }
    }
  }
  // Fallback: check the full class "notion-selectable" based pattern
  for (const key of Object.keys(BLOCK_TYPE_MAP)) {
    if (element.classList.contains(`notion-${key.replace('-block', '')}-block`)) {
      return key;
    }
  }
  return null;
}

/**
 * Get the text content of a block, truncated.
 */
export function getBlockText(element: Element, maxLength = 50): string {
  const textbox = element.querySelector(TEXTBOX);
  const text = (textbox?.textContent ?? element.textContent ?? '').trim();
  if (text.length > maxLength) {
    return text.slice(0, maxLength) + '…';
  }
  return text || '';
}
