// 拡張機能のインストール時やアップデート時に実行
chrome.runtime.onInstalled.addListener(() => {
  console.log('Notion Accessibility Enhancer がインストールされました');
});

// シンプルなURLチェック
function isValidUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return false;
  }
  
  try {
    const url = new URL(urlString);
    return url.hostname.includes('notion.so') || 
           url.hostname.includes('localhost') || 
           url.hostname.includes('127.0.0.1') ||
           url.protocol === 'file:';
  } catch {
    return false;
  }
}

// タブが更新されたときの処理
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 基本的な検証
  if (!tabId || !changeInfo || !tab) {
    return;
  }

  // タブのURLが完全に読み込まれるまで待機
  if (changeInfo.status !== 'complete') {
    return;
  }

  // タブのURLを安全に取得
  const url = tab?.url;
  if (!url) {
    return;
  }

  // URLの検証
  if (!isValidUrl(url)) {
    return;
  }

  // content.jsの実行
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  }).catch(error => {
    console.error('スクリプトの実行に失敗:', error);
  });
});

// エラーハンドリング
chrome.runtime.onError.addListener((error) => {
  console.error('拡張機能エラー:', error.message);
}); 