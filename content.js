// 設定の初期化
let settings = {
    enableHeadings: false,
    enableAltText: false,
    enableKeyboardNav: false
};

// 設定の読み込み
chrome.storage.local.get([
    'enableHeadings',
    'enableAltText',
    'enableKeyboardNav',
    'notionToken'
], function(result) {
    settings = {
        enableHeadings: result.enableHeadings || false,
        enableAltText: result.enableAltText || false,
        enableKeyboardNav: result.enableKeyboardNav || false
    };
    applyAccessibilityEnhancements();
});

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'updateSettings') {
        settings = message.settings;
        applyAccessibilityEnhancements();
    }
});

// アクセシビリティ機能の適用
function applyAccessibilityEnhancements() {
    if (settings.enableHeadings) {
        enhanceHeadings();
    }
    if (settings.enableAltText) {
        enhanceImages();
    }
    if (settings.enableKeyboardNav) {
        enhanceKeyboardNavigation();
    }
}

// 見出しの強調
function enhanceHeadings() {
    const headings = document.querySelectorAll('.notion-header-block');
    headings.forEach(heading => {
        if (!heading.getAttribute('role')) {
            heading.setAttribute('role', 'heading');
            heading.setAttribute('aria-level', '1');
        }
    });
}

// 画像の代替テキスト
function enhanceImages() {
    const images = document.querySelectorAll('img:not([alt])');
    images.forEach(async (img) => {
        const caption = img.closest('figure')?.querySelector('figcaption');
        if (caption) {
            img.setAttribute('alt', caption.textContent);
        } else {
            // NotionのAPIを使用して画像の説明を取得
            const blockId = img.closest('[data-block-id]')?.getAttribute('data-block-id');
            if (blockId) {
                try {
                    const token = await chrome.storage.local.get('notionToken');
                    if (token.notionToken) {
                        const description = await getImageDescription(blockId, token.notionToken);
                        if (description) {
                            img.setAttribute('alt', description);
                        }
                    }
                } catch (error) {
                    console.error('画像の説明の取得に失敗:', error);
                }
            }
        }
    });
}

// キーボードナビゲーションの強化
function enhanceKeyboardNavigation() {
    const blocks = document.querySelectorAll('.notion-page-content [contenteditable="true"]');
    blocks.forEach(block => {
        if (!block.getAttribute('tabindex')) {
            block.setAttribute('tabindex', '0');
        }
    });

    document.addEventListener('keydown', handleKeyboardNavigation);
}

// キーボードナビゲーションの処理
function handleKeyboardNavigation(event) {
    if (event.altKey) {
        switch (event.key) {
            case 'h':
                // 次の見出しへ移動
                navigateToNextHeading();
                break;
            case 'b':
                // 前のブロックへ移動
                navigateToPreviousBlock();
                break;
            case 'n':
                // 次のブロックへ移動
                navigateToNextBlock();
                break;
        }
    }
}

// NotionのAPIを使用して画像の説明を取得
async function getImageDescription(blockId, token) {
    try {
        const response = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Notion-Version': '2022-06-28'
            }
        });
        const data = await response.json();
        if (data.type === 'image') {
            return data.image.caption?.[0]?.plain_text || '装飾的な画像';
        }
        return null;
    } catch (error) {
        console.error('Notion APIエラー:', error);
        return null;
    }
}

// 次の見出しへ移動
function navigateToNextHeading() {
    const headings = Array.from(document.querySelectorAll('.notion-header-block'));
    const currentIndex = headings.findIndex(heading => 
        heading === document.activeElement || heading.contains(document.activeElement)
    );
    if (currentIndex > -1 && currentIndex < headings.length - 1) {
        headings[currentIndex + 1].focus();
    } else if (headings.length > 0) {
        headings[0].focus();
    }
}

// 前のブロックへ移動
function navigateToPreviousBlock() {
    const blocks = Array.from(document.querySelectorAll('.notion-page-content [contenteditable="true"]'));
    const currentIndex = blocks.findIndex(block => 
        block === document.activeElement || block.contains(document.activeElement)
    );
    if (currentIndex > 0) {
        blocks[currentIndex - 1].focus();
    }
}

// 次のブロックへ移動
function navigateToNextBlock() {
    const blocks = Array.from(document.querySelectorAll('.notion-page-content [contenteditable="true"]'));
    const currentIndex = blocks.findIndex(block => 
        block === document.activeElement || block.contains(document.activeElement)
    );
    if (currentIndex > -1 && currentIndex < blocks.length - 1) {
        blocks[currentIndex + 1].focus();
    } else if (blocks.length > 0) {
        blocks[0].focus();
    }
}

// MutationObserverを使用してDOMの変更を監視
const observer = new MutationObserver(() => {
    applyAccessibilityEnhancements();
});

// 監視の開始
observer.observe(document.body, {
    childList: true,
    subtree: true
}); 