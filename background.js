// 拡張機能のインストール時やアップデート時に実行
chrome.runtime.onInstalled.addListener(() => {
  console.log('Notion Accessibility Enhancer がインストールされました');
});

// シンプルなURLチェック
function isValidUrl(urlString) {
  try {
    if (!urlString || typeof urlString !== 'string') {
      return false;
    }
    return urlString.indexOf('notion.so') !== -1 || 
           urlString.indexOf('localhost') !== -1 || 
           urlString.indexOf('127.0.0.1') !== -1 ||
           urlString.indexOf('file://') === 0;
  } catch (e) {
    return false;
  }
}

// タブが更新されたときの処理
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  try {
    // 基本的な検証
    if (!tabId || !changeInfo || changeInfo.status !== 'complete') {
      return;
    }

    // タブ情報の取得
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        return;
      }

      const url = tab.url || '';
      
      // URLの検証
      if (!isValidUrl(url)) {
        return;
      }

      // content.jsの実行
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }).catch(() => {});
    });
  } catch (e) {
    // エラーを無視
  }
});

// エラーハンドリング
chrome.runtime.onError.addListener(() => {
  // エラーを無視
}); 