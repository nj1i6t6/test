document.addEventListener('DOMContentLoaded', () => {
    // --- 配置區域 ---
    // 移除硬編碼 API Key
    const API_URL_CHAT = 'https://api.x.ai/v1/chat/completions';
    const API_URL_MODELS = 'https://api.x.ai/v1/models'; // 用於測試連線
    let currentModel = 'grok-3-mini-beta';
    let apiKey = null; // 用於儲存驗證後的 API Key
    const LOCAL_STORAGE_KEY_SESSIONS = 'grokChatSessions';     // 儲存所有會話
    const LOCAL_STORAGE_KEY_ACTIVE_ID = 'grokLastActiveSessionId'; // 儲存上次活躍的 ID
    const LOCAL_STORAGE_KEY_API_KEY = 'grokApiKey';
    const LOCAL_STORAGE_KEY_MODEL = 'selectedModel';
    const LOCAL_STORAGE_KEY_THEME = 'theme';


    // --- DOM 元素獲取 ---
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const modelSelector = document.getElementById('model-selector');
    const exportButton = document.getElementById('export-button');
    const importButton = document.getElementById('import-button');
    const importFileInput = document.getElementById('import-file-input');
    // const clearButton = document.getElementById('clear-button'); // 這個按鈕功能改變了
    const deleteCurrentChatButton = document.getElementById('delete-current-chat-button'); // 新 ID
    const themeToggleButton = document.getElementById('theme-toggle-button');
    const body = document.body;
    const sidebar = document.getElementById('sidebar');
    const menuToggleButton = document.getElementById('menu-toggle-button');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const closeSidebarButton = document.getElementById('close-sidebar-button');
    // API Key 相關元素
    const apiKeyInput = document.getElementById('api-key-input');
    const connectApiButton = document.getElementById('connect-api-button');
    const apiStatus = document.getElementById('api-status');
    const clearApiKeyButton = document.getElementById('clear-api-key-button');
    const chatSessionList = document.getElementById('chat-session-list'); // 聊天列表 ul
    const newChatButton = document.getElementById('new-chat-button');      // 新增聊天按鈕
    const mobileChatTitle = document.getElementById('mobile-chat-title');  // 手機版標題


    // --- 狀態變數 ---
    let allSessions = [];          // 儲存所有會話對象 [{ sessionId, name, messages, createdAt, lastUpdatedAt }, ...]
    let currentSessionId = null;   // 當前活動的會話 ID
    let isLoading = false;
    let messageIdCounter = 0;      // 每個會話內消息 ID 可以獨立，或全局？先用全局
    let currentEditingMessageId = null;

    // --- 初始化 ---
    function initializeChat() {
        if (!checkElements()) {
             console.error("Initialization failed: One or more DOM elements not found.");
             // 在頁面上顯示一個更友好的提示，而不是僅依賴 console
             const initialMsg = document.querySelector('#chat-messages .system-message');
             if (initialMsg) initialMsg.textContent = "頁面元素加載錯誤，請檢查 HTML ID 是否正確。";
             return;
        }
        loadTheme();
        setupModelSelector();
        loadAllSessions();      // **加載所有會話列表**
        renderSessionList();    // **渲染側邊欄列表**
        loadInitialSession();   // **加載初始會話**
        loadAndVerifyApiKey();
        adjustTextareaHeight();
        setupEventListeners();
        console.log("Chat initialized with multi-session support.");
    }

    function checkElements() {
        const elementsToCheck = [chatMessages, userInput, sendButton, modelSelector, exportButton, importButton, importFileInput, /*clearButton,*/ deleteCurrentChatButton, themeToggleButton, body, sidebar, menuToggleButton, sidebarOverlay, closeSidebarButton, apiKeyInput, connectApiButton, apiStatus, clearApiKeyButton, chatSessionList, newChatButton, mobileChatTitle];
        const missingElements = elementsToCheck.filter(el => !el);
        if (missingElements.length > 0) { console.error("Missing DOM elements:", missingElements); return false; }
        return true;
    }

    // --- localStorage & Session Management ---
    function saveAllSessions() {
        try {
            // 更新當前會話的 lastUpdatedAt
            const currentSession = findSessionById(currentSessionId);
            if (currentSession) {
                currentSession.lastUpdatedAt = Date.now();
            }
             // 按最後更新時間降序排序 (最新的在前面)
             allSessions.sort((a, b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt));

            localStorage.setItem(LOCAL_STORAGE_KEY_SESSIONS, JSON.stringify(allSessions));
            localStorage.setItem(LOCAL_STORAGE_KEY_ACTIVE_ID, currentSessionId); // 保存當前活躍 ID
        } catch (e) { console.error("Error saving sessions to localStorage:", e); }
    }

    function loadAllSessions() {
        const savedSessions = localStorage.getItem(LOCAL_STORAGE_KEY_SESSIONS);
        if (savedSessions) {
            try {
                allSessions = JSON.parse(savedSessions);
                // 基本驗證
                if (!Array.isArray(allSessions) || !allSessions.every(s => s.sessionId && s.name && Array.isArray(s.messages))) {
                    console.error("Invalid session data format in localStorage. Clearing.");
                    allSessions = [];
                } else {
                     // 按最後更新時間排序，確保列表順序正確
                    allSessions.sort((a, b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt));
                    console.log("Sessions loaded from localStorage.");
                }
            } catch (e) { console.error("Error parsing sessions from localStorage:", e); allSessions = []; }
        }
        // 如果加載後為空，創建一個初始會話
        if (allSessions.length === 0) {
            handleNewChat(false); // 首次創建不觸發保存和渲染列表
            console.log("No sessions found, created initial chat.");
        }
    }

    function loadInitialSession() {
        const lastActiveId = localStorage.getItem(LOCAL_STORAGE_KEY_ACTIVE_ID);
        // 優先加載上次活躍的，其次加載列表中的第一個（最新的），如果列表為空則不加載
        const sessionToLoad = findSessionById(lastActiveId) || allSessions[0];

        if (sessionToLoad) {
            loadSession(sessionToLoad.sessionId);
        } else {
            // 理論上 loadAllSessions 會確保至少有一個 session，除非創建失敗
            console.warn("No session available to load initially.");
             // 可以顯示一個提示信息
             chatMessages.innerHTML = ''; // 確保清空
             displayMessage('system', '點擊 "+" 新增聊天開始對話', `system-init`);
        }
    }

    function findSessionById(sessionId) {
        return allSessions.find(s => s.sessionId === sessionId);
    }

    function findMessageById(sessionId, messageId) {
        const session = findSessionById(sessionId);
        return session?.messages.find(msg => msg.id === messageId);
    }

    function findMessageIndexById(sessionId, messageId) {
         const session = findSessionById(sessionId);
         return session?.messages.findIndex(msg => msg.id === messageId) ?? -1;
     }


    function renderSessionList() {
        chatSessionList.innerHTML = ''; // 清空列表
        if (allSessions.length === 0) {
            // 可以顯示一個 "無聊天記錄" 的提示
             const li = document.createElement('li');
             li.textContent = "無聊天記錄";
             li.style.padding = '10px';
             li.style.textAlign = 'center';
             li.style.color = 'var(--text-muted)';
             li.style.fontSize = '0.8em';
             chatSessionList.appendChild(li);
            return;
        }

        allSessions.forEach(session => {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.classList.add('session-button');
            button.textContent = session.name || `聊天 ${session.sessionId.slice(-4)}`; // 顯示名稱或部分 ID
            button.dataset.sessionId = session.sessionId;
            if (session.sessionId === currentSessionId) {
                button.classList.add('active'); // 標記當前活動項
            }
            button.addEventListener('click', () => {
                if (currentEditingMessageId) { // 如果正在編輯，提示用戶
                    if (!confirm("您正在編輯訊息，切換聊天將丟失未保存的更改。確定要切換嗎？")) {
                        return;
                    }
                     cancelEdit(currentEditingMessageId); // 取消編輯
                }
                loadSession(session.sessionId);
                closeSidebarIfMobile();
            });
            li.appendChild(button);
            chatSessionList.appendChild(li);
        });
    }

    function loadSession(sessionId) {
        const session = findSessionById(sessionId);
        if (!session) {
            console.error(`Session not found: ${sessionId}`);
             // 如果找不到，嘗試加載第一個
             if (allSessions.length > 0) {
                 loadSession(allSessions[0].sessionId);
             } else {
                 handleNewChat(); // 如果連第一個都沒有，創建新的
             }
            return;
        }

        currentSessionId = sessionId;
        localStorage.setItem(LOCAL_STORAGE_KEY_ACTIVE_ID, currentSessionId); // 保存活躍 ID

        // 更新側邊欄高亮
        document.querySelectorAll('#chat-session-list .session-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sessionId === currentSessionId);
        });

         // 更新手機版標題
         mobileChatTitle.textContent = session.name || `聊天 ${session.sessionId.slice(-4)}`;


        // 渲染聊天消息
        chatMessages.innerHTML = ''; // 清空
        messageIdCounter = 0; // 重置/重新計算消息 ID 計數器 (基於加載的消息)
        let maxMsgIdNum = -1;
        if (session.messages && session.messages.length > 0) {
            session.messages.forEach(message => {
                if (['user', 'assistant'].includes(message.role)) {
                    displayMessage(message.role, message.content, message.id);
                     // 更新 messageIdCounter
                     const idNum = parseInt(String(message.id).split('-')[1], 10);
                     if (!isNaN(idNum) && idNum > maxMsgIdNum) {
                         maxMsgIdNum = idNum;
                     }
                 }
                 // 可選：加載系統消息
                 else if (message.role === 'system' && !message.content?.startsWith("模型已切換至")) { // 避免重複顯示切換提示 (增加內容檢查)
                    displayMessage(message.role, message.content, message.id);
                 }
            });
             messageIdCounter = maxMsgIdNum + 1;
        } else {
             // 如果會話是空的，顯示提示
             displayMessage('system', '這個聊天是空的，開始輸入訊息吧！', `system-${sessionId}`);
        }

        scrollToBottom();
        console.log(`Loaded session: ${currentSessionId}`);
    }

    function generateSessionId() {
        return `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }

    function generateMessageId() {
         return `msg-${messageIdCounter++}`; // 全局自增 ID
     }

    function handleNewChat(render = true) { // 添加 render 參數控制是否立即渲染
        if (currentEditingMessageId) {
            if (!confirm("您正在編輯訊息，新增聊天將丟失未保存的更改。確定要繼續嗎？")) { return; }
            cancelEdit(currentEditingMessageId);
        }
        const newSessionId = generateSessionId();
        const newSession = { sessionId: newSessionId, name: `新聊天 ${new Date().toLocaleTimeString()}`, messages: [], createdAt: Date.now(), lastUpdatedAt: Date.now() };
        allSessions.unshift(newSession);
        currentSessionId = newSessionId;
        if (render) { renderSessionList(); loadSession(newSessionId); saveAllSessions(); }
        return newSession;
    }


    // --- API 金鑰處理 ---
    async function loadAndVerifyApiKey() { const storedKey = localStorage.getItem(LOCAL_STORAGE_KEY_API_KEY); if (storedKey) { console.log("Found stored API key. Verifying..."); setApiStatus("正在驗證儲存的金鑰...", "testing"); const isValid = await testApiKey(storedKey); if (isValid) { apiKey = storedKey; apiKeyInput.value = '********'; apiKeyInput.type = 'password'; setApiStatus("金鑰有效，已連線", "success"); enableChat(); clearApiKeyButton.style.display = 'block'; } else { setApiStatus("儲存的金鑰無效或已過期，請重新輸入", "error"); localStorage.removeItem(LOCAL_STORAGE_KEY_API_KEY); apiKeyInput.value = ''; apiKeyInput.type = 'text'; disableChat(); clearApiKeyButton.style.display = 'none'; } } else { setApiStatus("請輸入金鑰並連線", ""); disableChat(); clearApiKeyButton.style.display = 'none'; } }
    async function handleConnectApiKey() { const inputKey = apiKeyInput.value.trim(); if (!inputKey) { setApiStatus("請輸入 API 金鑰", "error"); return; } setApiStatus("正在測試連線...", "testing"); connectApiButton.disabled = true; const isValid = await testApiKey(inputKey); if (isValid) { apiKey = inputKey; localStorage.setItem(LOCAL_STORAGE_KEY_API_KEY, apiKey); setApiStatus("連線成功！", "success"); enableChat(); clearApiKeyButton.style.display = 'block'; apiKeyInput.value = '********'; apiKeyInput.type = 'password'; closeSidebarIfMobile(); } else { apiKey = null; localStorage.removeItem(LOCAL_STORAGE_KEY_API_KEY); disableChat(); clearApiKeyButton.style.display = 'none'; } connectApiButton.disabled = false; }
    async function testApiKey(keyToTest) { try { const response = await fetch(API_URL_MODELS, { method: 'GET', headers: { 'Authorization': `Bearer ${keyToTest}` } }); if (response.ok) { console.log("API Key validation successful."); return true; } else { let errorMsg = `連線失敗 (${response.status})`; try { const errorData = await response.json(); errorMsg += `: ${errorData.error || JSON.stringify(errorData)}`; } catch(e) { errorMsg += `: ${response.statusText}`; } setApiStatus(errorMsg, "error"); console.error("API Key validation failed:", errorMsg); return false; } } catch (error) { setApiStatus(`網路錯誤或無法連線`, "error"); console.error("Error testing API key:", error); return false; } }
    function handleClearApiKey() { if (confirm("確定要清除已儲存的 API 金鑰嗎？")) { apiKey = null; localStorage.removeItem(LOCAL_STORAGE_KEY_API_KEY); apiKeyInput.value = ''; apiKeyInput.type = 'text'; setApiStatus("金鑰已清除，請重新輸入並連線", ""); disableChat(); clearApiKeyButton.style.display = 'none'; console.log("API Key cleared."); closeSidebarIfMobile(); } }
    function setApiStatus(message, type = "") { apiStatus.textContent = message; apiStatus.className = `api-status-message status-${type}`; }
    function enableChat() { userInput.disabled = false; sendButton.disabled = false; userInput.classList.remove('chat-disabled'); sendButton.classList.remove('chat-disabled'); userInput.placeholder = "輸入訊息... (Enter 換行)"; }
    function disableChat() { userInput.disabled = true; sendButton.disabled = true; userInput.classList.add('chat-disabled'); sendButton.classList.add('chat-disabled'); userInput.placeholder = "請先連線 API..."; }

    // --- 主題切換 ---
    function toggleTheme() { body.classList.toggle('dark-mode'); const isDarkMode = body.classList.contains('dark-mode'); localStorage.setItem(LOCAL_STORAGE_KEY_THEME, isDarkMode ? 'dark' : 'light'); const icon = themeToggleButton.querySelector('i'); icon.className = isDarkMode ? 'fas fa-moon' : 'fas fa-sun'; }
    function loadTheme() { const savedTheme = localStorage.getItem(LOCAL_STORAGE_KEY_THEME); if (savedTheme === 'dark') { body.classList.add('dark-mode'); themeToggleButton.querySelector('i').className = 'fas fa-moon'; } else { body.classList.remove('dark-mode'); themeToggleButton.querySelector('i').className = 'fas fa-sun'; } }
    // --- 模型選擇 ---
    function setupModelSelector() { const savedModel = localStorage.getItem(LOCAL_STORAGE_KEY_MODEL); if (savedModel) { const exists = Array.from(modelSelector.options).some(option => option.value === savedModel); if (exists) { modelSelector.value = savedModel; } } currentModel = modelSelector.value; modelSelector.addEventListener('change', () => { currentModel = modelSelector.value; localStorage.setItem(LOCAL_STORAGE_KEY_MODEL, currentModel); displayMessage('system', `模型已切換至: ${currentModel}`, `system-${generateMessageId()}`); closeSidebarIfMobile(); }); }
    // --- 側邊欄控制 ---
    function openSidebar() { body.classList.add('sidebar-open'); } function closeSidebar() { body.classList.remove('sidebar-open'); } function toggleSidebar() { body.classList.toggle('sidebar-open'); } function closeSidebarIfMobile() { if (window.innerWidth <= 768 && body.classList.contains('sidebar-open')) { closeSidebar(); } }
    // --- 核心功能函數 ---
    function displayMessage(role, content, id, isError = false) { const messageDiv = document.createElement('div'); messageDiv.classList.add('message'); if (id) messageDiv.dataset.id = id; const contentContainer = document.createElement('div'); contentContainer.classList.add('message-content'); switch (role) { case 'user': messageDiv.classList.add('user-message'); contentContainer.textContent = content; break; case 'assistant': messageDiv.classList.add('assistant-message'); try { const rawHtml = marked.parse(content, { gfm: true, breaks: true }); const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } }); contentContainer.innerHTML = cleanHtml; } catch (e) { console.error("Error processing assistant message:", e); contentContainer.textContent = content; messageDiv.style.border = '1px dashed red'; } break; case 'system': messageDiv.classList.add('system-message'); if (isError) { messageDiv.classList.add('error-message'); messageDiv.textContent = `錯誤：${content}`; } else { messageDiv.textContent = content; } chatMessages.appendChild(messageDiv); scrollToBottom(); return messageDiv; case 'loading': messageDiv.classList.add('loading-message'); messageDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI 思考中...'; messageDiv.id = id || 'loading-indicator'; chatMessages.appendChild(messageDiv); scrollToBottom(); return messageDiv; default: messageDiv.classList.add('system-message'); messageDiv.textContent = content; chatMessages.appendChild(messageDiv); scrollToBottom(); return messageDiv; } messageDiv.appendChild(contentContainer); if (id && (role === 'user' || role === 'assistant')) { const actionsContainer = document.createElement('div'); actionsContainer.classList.add('message-actions'); actionsContainer.innerHTML = `<button class="action-copy" title="複製"><i class="fas fa-copy"></i></button><button class="action-edit" title="編輯"><i class="fas fa-pencil-alt"></i></button><button class="action-delete" title="刪除"><i class="fas fa-trash-alt"></i></button>`; messageDiv.appendChild(actionsContainer); } chatMessages.appendChild(messageDiv); scrollToBottom(); return messageDiv; }
    function scrollToBottom() { requestAnimationFrame(() => { chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' }); }); }
    async function callGrokApi() { const userText = userInput.value.trim(); if (!userText || isLoading) return; if (!apiKey) { displayMessage('system', '請先在側邊欄連線 API 金鑰。', `error-${generateMessageId()}`, true); openSidebar(); return; } if (!currentSessionId) { displayMessage('system', '沒有活動的聊天會話，請先新增聊天。', `error-${generateMessageId()}`, true); return; } isLoading = true; sendButton.disabled = true; userInput.disabled = true; const userMessageId = generateMessageId(); const userMessage = { role: 'user', content: userText, id: userMessageId, timestamp: Date.now() }; const currentSession = findSessionById(currentSessionId); if (!currentSession) { console.error("Current session not found!"); isLoading = false; sendButton.disabled = false; userInput.disabled = false; return; } currentSession.messages.push(userMessage); saveAllSessions(); displayMessage('user', userText, userMessageId); userInput.value = ''; adjustTextareaHeight(); const loadingId = `loading-${userMessageId}`; const loadingIndicator = displayMessage('loading', '', loadingId ); try { const messagesToSend = currentSession.messages.map(({ role, content }) => ({ role, content })); const requestBody = { messages: messagesToSend, model: currentModel, stream: false, temperature: 0.7 }; const response = await fetch(API_URL_CHAT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(requestBody) }); const currentLoading = document.getElementById(loadingId); if (currentLoading) chatMessages.removeChild(currentLoading); if (!response.ok) { let errorText = await response.text(); let errorMessage = `API 請求失敗 (${response.status} ${response.statusText})`; try { const errorJson = JSON.parse(errorText); if (errorJson.error && typeof errorJson.error === 'string') { errorMessage += `: ${errorJson.error}`; } else if (errorJson.error && errorJson.error.message) { errorMessage += `: ${errorJson.error.message}`; } else if (errorJson.detail) { errorMessage += `: ${JSON.stringify(errorJson.detail)}`; } else { errorMessage += `\n原始回應: ${errorText}`; } } catch (e) { errorMessage += `\n原始回應: ${errorText}`; } if (response.status === 401 || response.status === 403) { errorMessage += " 金鑰可能已失效，請嘗試重新連線。"; apiKey = null; localStorage.removeItem(LOCAL_STORAGE_KEY_API_KEY); disableChat(); setApiStatus("金鑰驗證失敗，請重新連線", "error"); clearApiKeyButton.style.display = 'none'; } console.error('API Error:', errorMessage); displayMessage('system', errorMessage, `error-${generateMessageId()}`, true); } else { const data = await response.json(); if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) { const assistantReply = data.choices[0].message.content.trim(); const assistantMessageId = generateMessageId(); const assistantMessage = { role: 'assistant', content: assistantReply, id: assistantMessageId, timestamp: Date.now() }; currentSession.messages.push(assistantMessage); saveAllSessions(); displayMessage('assistant', assistantReply, assistantMessageId); } else { console.error('Invalid API response structure:', data); displayMessage('system', '收到無效的 API 回應格式。', `error-${generateMessageId()}`, true); } } } catch (error) { console.error('Error calling Grok API:', error); const currentLoading = document.getElementById(loadingId); if (currentLoading) chatMessages.removeChild(currentLoading); if (!error.message.includes('API 請求失敗')) { displayMessage('system', `客戶端錯誤: ${error.message}`, `error-${generateMessageId()}`, true); } } finally { isLoading = false; if (apiKey) { sendButton.disabled = false; userInput.disabled = false; userInput.focus(); } } }
    // --- 匯出/匯入/清除 功能 ---
    function exportChat() { const currentSession = findSessionById(currentSessionId); if (!currentSession || currentSession.messages.length === 0) { alert('目前聊天沒有內容可匯出。'); return; } try { const exportData = { sessionId: currentSession.sessionId, name: currentSession.name, modelUsed: currentModel, timestamp: new Date().toISOString(), history: currentSession.messages }; const jsonString = JSON.stringify(exportData, null, 2); const blob = new Blob([jsonString], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); a.download = `grok-chat-${currentSession.name || currentSession.sessionId.slice(-4)}-${timestamp}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); closeSidebarIfMobile(); } catch (error) { console.error('Error exporting chat:', error); displayMessage('system', `匯出對話失敗: ${error.message}`, `error-${generateMessageId()}`, true); } }
    function importChat() { importFileInput.click(); }
    function handleFileImport(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { try { const importedData = JSON.parse(e.target.result); let historyToLoad = []; let sessionName = `導入的聊天 ${new Date().toLocaleTimeString()}`; let importedModel = null; if (Array.isArray(importedData) && importedData.every(item => typeof item === 'object' && item.role && typeof item.content !== 'undefined')) { historyToLoad = importedData.map((item, index) => ({...item, id: item.id || `imported-${index}`})); } else if (typeof importedData === 'object' && Array.isArray(importedData.history)) { historyToLoad = importedData.history.map((item, index) => ({...item, id: item.id || `imported-${index}`})); sessionName = importedData.name || sessionName; importedModel = importedData.modelUsed; } else { throw new Error('無法識別的檔案格式。'); } if (historyToLoad.length === 0) { throw new Error('匯入的檔案沒有有效的聊天訊息。'); } const newSessionId = generateSessionId(); const newSession = { sessionId: newSessionId, name: sessionName, messages: historyToLoad, createdAt: importedData.timestamp ? new Date(importedData.timestamp).getTime() : Date.now(), lastUpdatedAt: Date.now() }; allSessions.unshift(newSession); if (importedModel) { const exists = Array.from(modelSelector.options).some(option => option.value === importedModel); if (exists) { modelSelector.value = importedModel; currentModel = importedModel; localStorage.setItem(LOCAL_STORAGE_KEY_MODEL, currentModel); console.log(`模型已根據匯入文件設為: ${currentModel}`); } } renderSessionList(); loadSession(newSessionId); saveAllSessions(); displayMessage('system', `成功從 ${file.name} 匯入為新聊天。`, `system-${generateMessageId()}`); } catch (error) { console.error('Error importing chat:', error); displayMessage('system', `匯入檔案失敗: ${error.message}`, `error-${generateMessageId()}`, true); } finally { importFileInput.value = ''; closeSidebarIfMobile(); } }; reader.onerror = (e) => { console.error('Error reading file:', e); displayMessage('system', '讀取檔案時發生錯誤。',`error-${generateMessageId()}` ,true); importFileInput.value = ''; }; reader.readAsText(file); }
    function handleDeleteCurrentChat() { if (!currentSessionId || allSessions.length <= 1) { alert("無法刪除最後一個聊天會話。"); return; } const currentSession = findSessionById(currentSessionId); if (currentSession && confirm(`確定要刪除聊天 "${currentSession.name || '此聊天'}" 嗎？此操作無法復原。`)) { const sessionIndex = allSessions.findIndex(s => s.sessionId === currentSessionId); if (sessionIndex > -1) { allSessions.splice(sessionIndex, 1); const nextSessionIndex = sessionIndex > 0 ? sessionIndex - 1 : 0; const nextSessionId = allSessions[nextSessionIndex]?.sessionId; renderSessionList(); if (nextSessionId) { loadSession(nextSessionId); } else { handleNewChat(); } saveAllSessions(); console.log(`Session ${currentSessionId} deleted.`); } } closeSidebarIfMobile(); }
    // --- 訊息操作處理 ---
    function handleMessageActions(event) { const target = event.target; const actionButton = target.closest('.message-actions button'); const editControlsButton = target.closest('.message-edit-controls button'); const messageElement = target.closest('.message[data-id]'); if (currentEditingMessageId && !target.closest(`[data-id="${currentEditingMessageId}"] .message-edit-area`) && !target.closest(`[data-id="${currentEditingMessageId}"] .message-edit-controls`)) { cancelEdit(currentEditingMessageId); } if (messageElement && !actionButton && !editControlsButton && !messageElement.classList.contains('editing') && !target.closest('.message-edit-area')) { const currentlyVisible = document.querySelector('.message.actions-visible'); if (currentlyVisible && currentlyVisible !== messageElement) { currentlyVisible.classList.remove('actions-visible'); } if (currentEditingMessageId !== messageElement.dataset.id) { messageElement.classList.toggle('actions-visible'); } event.stopPropagation(); return; } if (actionButton && messageElement && !messageElement.classList.contains('editing')) { const messageId = messageElement.dataset.id; const messageData = findMessageById(currentSessionId, messageId); if (!messageData) return; if (actionButton.classList.contains('action-copy')) { if (messageData.content) { navigator.clipboard.writeText(messageData.content).then(() => { const originalIcon = actionButton.innerHTML; actionButton.innerHTML = '<i class="fas fa-check"></i>'; setTimeout(() => { actionButton.innerHTML = originalIcon; }, 1000); }).catch(err => { console.error('無法複製訊息:', err); alert('複製失敗！'); }); } } else if (actionButton.classList.contains('action-delete')) { if (confirm('確定要刪除此訊息嗎？')) { const messageIndex = findMessageIndexById(currentSessionId, messageId); const session = findSessionById(currentSessionId); if (session && messageIndex > -1) { session.messages.splice(messageIndex, 1); saveAllSessions(); messageElement.remove(); console.log(`Message ${messageId} deleted.`); } } } else if (actionButton.classList.contains('action-edit')) { startEdit(messageElement, messageData); } hideAllMessageActions(); event.stopPropagation(); return; } if (editControlsButton && messageElement && messageElement.classList.contains('editing')) { const messageId = messageElement.dataset.id; if (editControlsButton.classList.contains('save-edit-button')) { saveEdit(messageId, messageElement); } else if (editControlsButton.classList.contains('cancel-edit-button')) { cancelEdit(messageId); } event.stopPropagation(); return; } if (!target.closest('.message') && !target.closest('.sidebar') && !target.closest('.mobile-header') && !currentEditingMessageId) { hideAllMessageActions(); } }
    function hideAllMessageActions() { document.querySelectorAll('.message.actions-visible').forEach(el => { if (!el.classList.contains('editing')) { el.classList.remove('actions-visible'); } }); }
    // --- 編輯相關函數 ---
    function startEdit(messageElement, messageData) { if (currentEditingMessageId && currentEditingMessageId !== messageData.id) { cancelEdit(currentEditingMessageId); } currentEditingMessageId = messageData.id; messageElement.classList.add('editing'); hideAllMessageActions(); const contentContainer = messageElement.querySelector('.message-content'); if (!contentContainer) return; const editAreaDiv = document.createElement('div'); editAreaDiv.classList.add('message-edit-area'); const textarea = document.createElement('textarea'); textarea.value = messageData.content; textarea.rows = Math.min(10, Math.max(3, messageData.content.split('\n').length)); const controlsDiv = document.createElement('div'); controlsDiv.classList.add('message-edit-controls'); controlsDiv.innerHTML = `<button class="cancel-edit-button">取消</button><button class="save-edit-button">保存</button>`; editAreaDiv.appendChild(textarea); editAreaDiv.appendChild(controlsDiv); messageElement.appendChild(editAreaDiv); textarea.focus(); textarea.select(); }
    function saveEdit(messageId, messageElement) { const editArea = messageElement.querySelector('.message-edit-area'); const textarea = editArea?.querySelector('textarea'); if (!textarea || !messageId) return; const newContent = textarea.value.trim(); const session = findSessionById(currentSessionId); const messageIndex = findMessageIndexById(currentSessionId, messageId); if (session && messageIndex > -1 && newContent) { const oldMessageData = session.messages[messageIndex]; session.messages[messageIndex] = { ...oldMessageData, content: newContent }; saveAllSessions(); const contentContainer = messageElement.querySelector('.message-content'); if (contentContainer) { if (oldMessageData.role === 'user') { contentContainer.textContent = newContent; } else if (oldMessageData.role === 'assistant') { try { const rawHtml = marked.parse(newContent, { gfm: true, breaks: true }); const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } }); contentContainer.innerHTML = cleanHtml; } catch (e) { console.error("Error re-rendering edited message:", e); contentContainer.textContent = newContent; } } } editArea.remove(); messageElement.classList.remove('editing'); currentEditingMessageId = null; console.log(`Message ${messageId} updated.`); } else if (!newContent) { alert("訊息內容不能為空！"); } }
    function cancelEdit(messageId) { const messageElement = document.querySelector(`.message[data-id="${messageId}"]`); if (messageElement) { const editArea = messageElement.querySelector('.message-edit-area'); if (editArea) editArea.remove(); messageElement.classList.remove('editing'); } if (currentEditingMessageId === messageId) { currentEditingMessageId = null; } }
    // --- 動態調整 Textarea 高度 ---
    function adjustTextareaHeight() { const maxHeight = 120; userInput.style.height = 'auto'; const newHeight = Math.min(userInput.scrollHeight, maxHeight); userInput.style.height = `${newHeight}px`; }
    // --- 事件監聽器綁定 ---
    function setupEventListeners() {
        sendButton.addEventListener('click', callGrokApi);
        userInput.addEventListener('input', adjustTextareaHeight);
        themeToggleButton.addEventListener('click', () => { toggleTheme(); closeSidebarIfMobile(); });
        exportButton.addEventListener('click', exportChat);
        importButton.addEventListener('click', importChat);
        importFileInput.addEventListener('change', handleFileImport);
        // clearButton.addEventListener('click', clearChat); // 舊按鈕移除
        deleteCurrentChatButton.addEventListener('click', handleDeleteCurrentChat); // 新按鈕
        menuToggleButton.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', closeSidebar);
        closeSidebarButton.addEventListener('click', closeSidebar);
        connectApiButton.addEventListener('click', handleConnectApiKey);
        clearApiKeyButton.addEventListener('click', handleClearApiKey);
        newChatButton.addEventListener('click', () => { handleNewChat(); closeSidebarIfMobile(); }); // 新增聊天按鈕
        document.addEventListener('click', handleMessageActions, true);
        console.log("Event listeners attached.");
    }

    // --- 執行初始化 ---
    initializeChat();

}); // <-- 確保這個結尾的 }); 存在！