// 拡張機能のインストール時やアップデート時に実行
chrome.runtime.onInstalled.addListener(() => {
  console.log('Notion Accessibility Enhancer がインストールされました');
});

// シンプルなURLチェック
function isValidUrl(urlString) {
  // 基本的な検証
  if (!urlString || typeof urlString !== 'string') {
    return false;
  }

  // 単純な文字列チェック
  return urlString.includes('notion.so') || 
         urlString.includes('localhost') || 
         urlString.includes('127.0.0.1') ||
         urlString.startsWith('file://');
}

// タブが更新されたときの処理
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  try {
    // 基本的な検証
    if (!tab?.url || !tabId || changeInfo.status !== 'complete') {
      return;
    }

    // URLの検証
    if (!isValidUrl(tab.url)) {
      return;
    }

    // content.jsの実行
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).catch(() => {
      // エラーを無視
    });
  } catch (error) {
    // エラーを無視
  }
});

// エラーハンドリング
chrome.runtime.onError.addListener((error) => {
  console.error('拡張機能エラー:', error.message);
}); 