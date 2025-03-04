// Notionページのアクセシビリティを改善する関数
function enhanceAccessibility() {
  // クリック可能な要素の処理
  const clickableElements = document.querySelectorAll('div[role="button"], div[tabindex="0"]');
  clickableElements.forEach(element => {
    // 不適切なrole属性を修正
    if (element.getAttribute('role') === 'button' && !element.onclick) {
      element.removeAttribute('role');
    }
    
    // 実際にクリック可能な要素のみtabindex="0"を保持
    if (element.getAttribute('tabindex') === '0' && !element.onclick) {
      element.removeAttribute('tabindex');
    }
  });

  // ブロック要素の適切なラベル付け
  const blocks = document.querySelectorAll('.notion-page-content [contenteditable="true"]');
  blocks.forEach(block => {
    if (!block.getAttribute('aria-label')) {
      const blockType = determineBlockType(block);
      block.setAttribute('aria-label', `${blockType}ブロック`);
    }
  });

  // ナビゲーション要素の改善
  const navigation = document.querySelector('.notion-sidebar');
  if (navigation) {
    navigation.setAttribute('role', 'navigation');
    navigation.setAttribute('aria-label', 'サイドバーナビゲーション');
  }

  // 画像の代替テキスト追加
  const images = document.querySelectorAll('img:not([alt])');
  images.forEach(img => {
    const caption = img.closest('figure')?.querySelector('figcaption');
    img.setAttribute('alt', caption?.textContent || '装飾的な画像');
  });
}

// ブロックタイプを判定する補助関数
function determineBlockType(block) {
  const classList = block.classList;
  if (classList.contains('notion-header-block')) return 'ヘッダー';
  if (classList.contains('notion-text-block')) return 'テキスト';
  if (classList.contains('notion-todo-block')) return 'タスク';
  if (classList.contains('notion-bulleted-list')) return 'リスト';
  return '編集可能';
}

// MutationObserverを使用してDOMの変更を監視
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.addedNodes.length > 0) {
      enhanceAccessibility();
    }
  });
});

// 監視の開始
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// 初回実行
enhanceAccessibility(); 