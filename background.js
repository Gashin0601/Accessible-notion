// 拡張機能のインストール時やアップデート時に実行
chrome.runtime.onInstalled.addListener(() => {
  console.log('Notion Accessibility Enhancer がインストールされました');
});

// タブが更新されたときの処理
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // URLが存在し、notion.soを含む場合のみ実行
  if (changeInfo.status === 'complete' && tab?.url && tab.url.includes('notion.so')) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
  }
}); 