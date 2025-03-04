document.addEventListener('DOMContentLoaded', function() {
    // 要素の取得
    const tokenInput = document.getElementById('integrationToken');
    const saveTokenButton = document.getElementById('saveToken');
    const saveSettingsButton = document.getElementById('saveSettings');
    const headingsCheckbox = document.getElementById('enableHeadings');
    const altTextCheckbox = document.getElementById('enableAltText');
    const keyboardNavCheckbox = document.getElementById('enableKeyboardNav');
    const statusDiv = document.getElementById('status');

    // 保存された設定の読み込み
    chrome.storage.local.get([
        'notionToken',
        'enableHeadings',
        'enableAltText',
        'enableKeyboardNav'
    ], function(result) {
        tokenInput.value = result.notionToken || '';
        headingsCheckbox.checked = result.enableHeadings || false;
        altTextCheckbox.checked = result.enableAltText || false;
        keyboardNavCheckbox.checked = result.enableKeyboardNav || false;
    });

    // トークンの保存
    saveTokenButton.addEventListener('click', function() {
        const token = tokenInput.value;
        if (!token) {
            showStatus('トークンを入力してください', false);
            return;
        }

        // トークンの検証
        validateToken(token).then(isValid => {
            if (isValid) {
                chrome.storage.local.set({ notionToken: token }, function() {
                    showStatus('トークンを保存しました', true);
                });
            } else {
                showStatus('無効なトークンです', false);
            }
        });
    });

    // 設定の保存
    saveSettingsButton.addEventListener('click', function() {
        const settings = {
            enableHeadings: headingsCheckbox.checked,
            enableAltText: altTextCheckbox.checked,
            enableKeyboardNav: keyboardNavCheckbox.checked
        };

        chrome.storage.local.set(settings, function() {
            showStatus('設定を保存しました', true);
            // 現在のタブでコンテンツスクリプトを再実行
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0] && tabs[0].url.includes('notion.so')) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'updateSettings',
                        settings: settings
                    });
                }
            });
        });
    });

    // トークンの検証
    async function validateToken(token) {
        try {
            const response = await fetch('https://api.notion.com/v1/users/me', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Notion-Version': '2022-06-28'
                }
            });
            return response.ok;
        } catch (error) {
            console.error('トークン検証エラー:', error);
            return false;
        }
    }

    // ステータスメッセージの表示
    function showStatus(message, isSuccess) {
        statusDiv.textContent = message;
        statusDiv.className = 'status ' + (isSuccess ? 'success' : 'error');
        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = '';
        }, 3000);
    }
}); 