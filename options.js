document.addEventListener('DOMContentLoaded', async function() {
    // 要素の取得
    const enableHeadings = document.getElementById('enableHeadings');
    const enableAltText = document.getElementById('enableAltText');
    const enableKeyboardNav = document.getElementById('enableKeyboardNav');
    const notionToken = document.getElementById('notionToken');
    const validateTokenButton = document.getElementById('validateToken');
    const saveSettingsButton = document.getElementById('saveSettings');
    const tokenStatus = document.getElementById('tokenStatus');
    const saveStatus = document.getElementById('saveStatus');

    // 保存された設定の読み込み
    const loadSettings = async () => {
        const settings = await chrome.storage.local.get([
            'enableHeadings',
            'enableAltText',
            'enableKeyboardNav',
            'notionToken'
        ]);

        enableHeadings.checked = settings.enableHeadings || false;
        enableAltText.checked = settings.enableAltText || false;
        enableKeyboardNav.checked = settings.enableKeyboardNav || false;
        notionToken.value = settings.notionToken || '';
    };

    // トークンの検証
    const validateToken = async (token) => {
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
    };

    // ステータスメッセージの表示
    const showStatus = (element, message, isSuccess) => {
        element.textContent = message;
        element.className = 'status ' + (isSuccess ? 'success' : 'error');
        setTimeout(() => {
            element.textContent = '';
            element.className = 'status';
        }, 3000);
    };

    // トークン検証ボタンのイベントリスナー
    validateTokenButton.addEventListener('click', async () => {
        const token = notionToken.value;
        if (!token) {
            showStatus(tokenStatus, 'トークンを入力してください', false);
            return;
        }

        const isValid = await validateToken(token);
        showStatus(tokenStatus, isValid ? 'トークンは有効です' : '無効なトークンです', isValid);
    });

    // 設定保存ボタンのイベントリスナー
    saveSettingsButton.addEventListener('click', async () => {
        const settings = {
            enableHeadings: enableHeadings.checked,
            enableAltText: enableAltText.checked,
            enableKeyboardNav: enableKeyboardNav.checked,
            notionToken: notionToken.value
        };

        await chrome.storage.local.set(settings);
        showStatus(saveStatus, '設定を保存しました', true);

        // 現在のタブでコンテンツスクリプトを更新
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        for (const tab of tabs) {
            if (tab.url?.includes('notion.so')) {
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'updateSettings',
                    settings: settings
                });
            }
        }
    });

    // 初期設定の読み込み
    await loadSettings();
}); 