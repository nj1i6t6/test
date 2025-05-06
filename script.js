/**
 * AI Web Chat - Enhanced for Roleplay
 * Features: Grok/Gemini support, User Persona, System Prompt, Summarization, Regenerate.
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const config = {
        apiUrls: {
            grok: { chat: 'https://api.x.ai/v1/chat/completions', models: 'https://api.x.ai/v1/models' },
            gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/models/' }
        },
        localStorageKeys: {
            sessions: 'aiChatSessions_v3',
            activeId: 'aiLastActiveSessionId_v3',
            apiKey: 'aiApiKey',
            model: 'selectedAiModel',
            theme: 'theme'
        },
        defaultModel: 'grok-3-mini-beta',
        modelsMeta: {
            'grok-3-mini-beta': { type: 'grok', displayName: 'Grok 3 Mini (Beta)' },
            'grok-3-latest': { type: 'grok', displayName: 'Grok 3 Latest' },
            'grok-3-fast-beta': { type: 'grok', displayName: 'Grok 3 Fast (Beta)' },
            'grok-3-beta': { type: 'grok', displayName: 'Grok 3 (Beta)' },
            'grok-2-1212': { type: 'grok', displayName: 'Grok 2 (1212)' },
            'gemini-2.5-flash-preview-04-17': { type: 'gemini', displayName: 'Gemini 2.5 Flash Preview' },
            'gemini-2.5-pro-exp-03-25': { type: 'gemini', displayName: 'Gemini 2.5 Pro Exp' }
        },
        summarizationTriggerThreshold: 30,
        messagesToKeepAfterSummary: 20,
        defaultSystemPromptIfEmpty: "", // User can set their own system prompt
        // forceTraditionalChineseSuffix: "請務必全程使用繁體中文回答。", // REMOVED
        elements: {
            chatMessages: document.getElementById('chat-messages'),
            userInput: document.getElementById('user-input'),
            sendButton: document.getElementById('send-button'),
            modelSelector: document.getElementById('model-selector'),
            exportButton: document.getElementById('export-button'),
            importButton: document.getElementById('import-button'),
            importFileInput: document.getElementById('import-file-input'),
            deleteCurrentChatButton: document.getElementById('delete-current-chat-button'),
            themeToggleButton: document.getElementById('theme-toggle-button'),
            body: document.body,
            sidebar: document.getElementById('sidebar'),
            menuToggleButton: document.getElementById('menu-toggle-button'),
            sidebarOverlay: document.getElementById('sidebar-overlay'),
            closeSidebarButton: document.getElementById('close-sidebar-button'),
            apiKeyInput: document.getElementById('api-key-input'),
            connectApiButton: document.getElementById('connect-api-button'),
            apiStatus: document.getElementById('api-status'),
            clearApiKeyButton: document.getElementById('clear-api-key-button'),
            chatSessionList: document.getElementById('chat-session-list'),
            newChatButton: document.getElementById('new-chat-button'),
            mobileChatTitle: document.getElementById('mobile-chat-title'),
            userNameInput: document.getElementById('user-name-input'),
            systemPromptInput: document.getElementById('system-prompt-input'),
            saveSessionSettingsButton: document.getElementById('save-session-settings-button'),
            summarizeChatButton: document.getElementById('summarize-chat-button'),
        }
    };

    // --- State Management ---
    const state = {
        apiKey: null,
        sessions: [],
        activeSessionId: null,
        currentModel: config.defaultModel,
        currentTheme: 'light',
        isLoading: false,
        isSummarizing: false,
        currentEditingMessageId: null,
        messageIdCounter: 0
    };

    // --- Storage Module (LocalStorage interaction) ---
    const storage = {
        saveSessions: () => {
            try {
                const activeSession = state.sessions.find(s => s.sessionId === state.activeSessionId);
                if (activeSession) {
                    activeSession.lastUpdatedAt = Date.now();
                    activeSession.userName = activeSession.userName || '';
                    activeSession.systemPrompt = activeSession.systemPrompt || '';
                    activeSession.currentSummary = activeSession.currentSummary || '';
                }
                state.sessions.sort((a, b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt));
                localStorage.setItem(config.localStorageKeys.sessions, JSON.stringify(state.sessions));
                localStorage.setItem(config.localStorageKeys.activeId, state.activeSessionId);
            } catch (e) { console.error("Error saving sessions:", e); ui.showSystemMessage("保存會話失敗。", `error-storage-${Date.now()}`, true); }
        },
        loadSessions: () => {
            const savedData = localStorage.getItem(config.localStorageKeys.sessions);
            if (savedData) {
                try {
                    const loadedSessions = JSON.parse(savedData);
                    if (Array.isArray(loadedSessions)) {
                        state.sessions = loadedSessions.map(s => ({
                            ...s,
                            userName: s.userName || '',
                            systemPrompt: s.systemPrompt || '',
                            currentSummary: s.currentSummary || '',
                            messages: Array.isArray(s.messages) ? s.messages : []
                        }));
                        state.sessions.sort((a, b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt));
                        return true;
                    }
                } catch (e) { console.error("Error parsing sessions:", e); state.sessions = []; }
            }
            return false;
        },
        saveActiveSessionId: () => localStorage.setItem(config.localStorageKeys.activeId, state.activeSessionId),
        loadActiveSessionId: () => localStorage.getItem(config.localStorageKeys.activeId),
        saveApiKey: () => localStorage.setItem(config.localStorageKeys.apiKey, state.apiKey),
        loadApiKey: () => localStorage.getItem(config.localStorageKeys.apiKey),
        removeApiKey: () => localStorage.removeItem(config.localStorageKeys.apiKey),
        saveTheme: () => localStorage.setItem(config.localStorageKeys.theme, state.currentTheme),
        loadTheme: () => localStorage.getItem(config.localStorageKeys.theme) || 'light',
        saveModel: () => localStorage.setItem(config.localStorageKeys.model, state.currentModel),
        loadModel: () => {
            const savedModel = localStorage.getItem(config.localStorageKeys.model);
            return (savedModel && config.modelsMeta[savedModel]) ? savedModel : config.defaultModel;
        }
    };

    // --- UI Module ---
    const ui = {
        getElement: (key) => config.elements[key],
        populateModelSelector: () => {
            const selector = ui.getElement('modelSelector');
            if (!selector) return;
            selector.innerHTML = '';
            for (const modelId in config.modelsMeta) {
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = config.modelsMeta[modelId].displayName;
                selector.appendChild(option);
            }
        },
        renderMessage: (message) => {
            const { role, content, id, isError = false, edited = false } = message;
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message');
            if (id) messageDiv.dataset.id = id;
            const contentContainer = document.createElement('div');
            contentContainer.classList.add('message-content');

            switch (role) {
                case 'user':
                    messageDiv.classList.add('user-message');
                    contentContainer.textContent = content;
                    break;
                case 'assistant':
                    messageDiv.classList.add('assistant-message');
                    try {
                        const rawHtml = marked.parse(content, { gfm: true, breaks: true });
                        contentContainer.innerHTML = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
                    } catch (e) { contentContainer.textContent = content; }
                    break;
                default: return null;
            }
            messageDiv.appendChild(contentContainer);
            messageDiv.dataset.originalContent = content;

            if (id && (role === 'user' || role === 'assistant')) {
                const actionsContainer = document.createElement('div');
                actionsContainer.classList.add('message-actions');
                let buttonsHtml = `
                    <button class="action-button action-copy" title="複製"><i class="fas fa-copy"></i></button>
                    <button class="action-button action-edit" title="編輯"><i class="fas fa-pencil-alt"></i></button>
                `;
                if (role === 'assistant') {
                    buttonsHtml += `<button class="action-button action-regenerate" title="重新生成"><i class="fas fa-redo"></i></button>`;
                }
                buttonsHtml += `<button class="action-button action-delete" title="刪除"><i class="fas fa-trash-alt"></i></button>
                    ${edited ? '<span class="edited-indicator" title="已編輯"><i class="fas fa-history"></i></span>' : ''}
                `;
                actionsContainer.innerHTML = buttonsHtml;
                messageDiv.appendChild(actionsContainer);
            }
            return messageDiv;
        },
        renderMessages: (messages = []) => {
            const messagesContainer = ui.getElement('chatMessages');
            if (!messagesContainer) return;
            messagesContainer.innerHTML = '';
            state.messageIdCounter = 0; let maxMsgIdNum = -1;

            if (messages.length === 0) {
                ui.showSystemMessage("這個聊天是空的，開始輸入訊息吧！", `system-empty-${state.activeSessionId || 'init'}`);
            } else {
                messages.forEach(msg => {
                    const messageElement = ui.renderMessage(msg);
                    if (messageElement) {
                        messagesContainer.appendChild(messageElement);
                        if (msg.id) { const idNum = parseInt(String(msg.id).split('-').pop(), 10); if (!isNaN(idNum) && idNum > maxMsgIdNum) maxMsgIdNum = idNum; }
                    } else if (msg.role === 'system') { ui.showSystemMessage(msg.content, msg.id, msg.isError); }
                });
                state.messageIdCounter = maxMsgIdNum >= 0 ? maxMsgIdNum + 1 : 0;
            }
            ui.scrollToBottom();
        },
        renderSessionList: () => {
            const listContainer = ui.getElement('chatSessionList');
            if (!listContainer) return;
            listContainer.innerHTML = '';
            if (state.sessions.length === 0) {
                const emptyLi = document.createElement('li');
                emptyLi.textContent = '沒有聊天記錄';
                emptyLi.style.padding = '10px';
                emptyLi.style.textAlign = 'center';
                emptyLi.style.color = 'var(--text-muted)';
                listContainer.appendChild(emptyLi);
                return;
            }
            state.sessions.forEach(session => {
                const li = document.createElement('li');
                li.classList.add('session-item');
                li.dataset.sessionId = session.sessionId;
                if (session.sessionId === state.activeSessionId) {
                    li.classList.add('active');
                }

                const nameSpan = document.createElement('span');
                nameSpan.classList.add('session-name');
                nameSpan.textContent = session.name || `聊天 ${session.sessionId.slice(-4)}`;
                nameSpan.title = session.name || `聊天 ${session.sessionId.slice(-4)}`;

                const renameButton = document.createElement('button');
                renameButton.classList.add('session-rename-button');
                renameButton.innerHTML = '<i class="fas fa-pencil-alt"></i>';
                renameButton.title = '重新命名';

                li.appendChild(nameSpan);
                li.appendChild(renameButton);
                listContainer.appendChild(li);
            });
        },
        loadSessionUI: (sessionId) => {
            const session = state.sessions.find(s => s.sessionId === sessionId);
            if (!session) {
                console.error("Session not found for UI load:", sessionId);
                if (state.sessions.length > 0) {
                    logic.activateSession(state.sessions[0].sessionId);
                } else {
                    events.handleNewChat();
                }
                return;
            }
            state.activeSessionId = sessionId;
            // storage.saveActiveSessionId(); // activateSession already saves this

            document.querySelectorAll('#chat-session-list li').forEach(li => {
                li.classList.toggle('active', li.dataset.sessionId === sessionId);
            });
            const mobileTitleEl = ui.getElement('mobileChatTitle');
            if(mobileTitleEl) mobileTitleEl.textContent = session.name || `聊天 ${session.sessionId.slice(-4)}`;

            const userNameInputEl = ui.getElement('userNameInput');
            const systemPromptInputEl = ui.getElement('systemPromptInput');
            if (userNameInputEl) userNameInputEl.value = session.userName || '';
            if (systemPromptInputEl) systemPromptInputEl.value = session.systemPrompt || '';

            ui.renderMessages(session.messages);
        },
        updateChatInputState: (enabled, customPlaceholder = null) => {
            const userInputEl = ui.getElement('userInput');
            const sendButtonEl = ui.getElement('sendButton');
            if (!userInputEl || !sendButtonEl) return;

            const shouldEnable = enabled && !!state.apiKey;
            userInputEl.disabled = !shouldEnable;
            sendButtonEl.disabled = !shouldEnable;
            userInputEl.classList.toggle('chat-disabled', !shouldEnable);
            sendButtonEl.classList.toggle('chat-disabled', !shouldEnable);

            if (customPlaceholder !== null) {
                userInputEl.placeholder = customPlaceholder;
            } else if (state.apiKey) {
                 userInputEl.placeholder = shouldEnable ? "輸入訊息..." : "正在連線或連線失敗，請稍候或檢查金鑰...";
            } else {
                 userInputEl.placeholder = "請先在側邊欄輸入並連線 API...";
            }
            sendButtonEl.title = shouldEnable ? "傳送訊息" : "無法傳送";
        },
        showSystemMessage: (content, id, isError = false) => {
            if (!id) id = `system-msg-${Date.now()}`;
            ui.removeElementById(id);
            const messagesContainer = ui.getElement('chatMessages');
            if (!messagesContainer) return;

            const systemMessageDiv = document.createElement('div');
            systemMessageDiv.classList.add('system-message');
            if (isError) systemMessageDiv.classList.add('error-message');
            systemMessageDiv.id = id;
            systemMessageDiv.textContent = content;
            messagesContainer.appendChild(systemMessageDiv);
            ui.scrollToBottom();
        },
        showLoadingIndicator: (loadingId, text = "AI 思考中...") => {
            ui.removeElementById(loadingId);
            const messagesContainer = ui.getElement('chatMessages');
            if (!messagesContainer) return null;
            const loadingDiv = document.createElement('div');
            loadingDiv.classList.add('message', 'loading-message');
            loadingDiv.id = loadingId;
            loadingDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text}`;
            messagesContainer.appendChild(loadingDiv);
            ui.scrollToBottom();
            return loadingDiv;
        },
        removeElementById: (id) => {
            const element = document.getElementById(id);
            if (element) element.remove();
        },
        scrollToBottom: () => {
            const messagesContainer = ui.getElement('chatMessages');
            if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
        },
        updateApiStatus: (message, type = "") => {
            const apiStatusEl = ui.getElement('apiStatus');
            const clearApiKeyButtonEl = ui.getElement('clearApiKeyButton');
            if (!apiStatusEl) return;
            apiStatusEl.textContent = message;
            apiStatusEl.className = 'api-status-message';
            if (type) apiStatusEl.classList.add(`status-${type}`);
            if (clearApiKeyButtonEl) clearApiKeyButtonEl.style.display = state.apiKey ? 'block' : 'none';
        },
        updateThemeUI: () => {
            const body = ui.getElement('body');
            const themeToggleButton = ui.getElement('themeToggleButton');
            if (!body || !themeToggleButton) return;
            if (state.currentTheme === 'dark') {
                body.classList.add('dark-mode');
                themeToggleButton.innerHTML = '<i class="fas fa-moon"></i> 切換主題';
            } else {
                body.classList.remove('dark-mode');
                themeToggleButton.innerHTML = '<i class="fas fa-sun"></i> 切換主題';
            }
        },
        adjustTextareaHeight: (textarea = ui.getElement('userInput')) => {
            if (!textarea) return;
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        },
        showEditUI: (messageElement, initialContent) => { /* ... */ },
        hideEditUI: (messageElement) => { /* ... */ },
        hideAllMessageActions: () => { /* ... */ },
        adjustTextareaHeightForEdit: (textarea) => { /* ... */ },
        closeSidebarIfMobile: () => {
            const body = ui.getElement('body');
            if (window.innerWidth <= 768 && body && body.classList.contains('sidebar-open')) {
                body.classList.remove('sidebar-open');
            }
        },
        hideAllRenameButtons: () => { /* ... */ }
    };

    // --- API Module ---
    const api = {
        getApiConfigForModel: (modelId) => {
            const modelMeta = config.modelsMeta[modelId];
            if (!modelMeta) return null;
            if (modelMeta.type === 'grok') {
                return { type: 'grok', chatUrl: config.apiUrls.grok.chat, modelsUrl: config.apiUrls.grok.models };
            } else if (modelMeta.type === 'gemini') {
                return { type: 'gemini', chatUrl: `${config.apiUrls.gemini.base}${modelId}:generateContent` };
            }
            return null;
        },
        testApiKey: async (keyToTest) => {
            // ... (same as before) ...
            if (!keyToTest) { ui.updateApiStatus("API 金鑰不能為空。", "error"); return false; }
            const modelToTestWith = state.currentModel;
            const apiConfig = api.getApiConfigForModel(modelToTestWith);
            if (!apiConfig) { ui.updateApiStatus(`找不到模型 ${modelToTestWith} 的 API 設定。`, "error"); return false; }
            ui.updateApiStatus(`正在測試 ${config.modelsMeta[modelToTestWith]?.displayName || modelToTestWith} 金鑰...`, "testing");
            try {
                let response;
                if (apiConfig.type === 'grok') {
                    response = await fetch(apiConfig.modelsUrl, { headers: { 'Authorization': `Bearer ${keyToTest}` } });
                } else if (apiConfig.type === 'gemini') {
                    const testModelUrl = `${config.apiUrls.gemini.base}${modelToTestWith}?key=${keyToTest}`;
                    response = await fetch(testModelUrl);
                } else { throw new Error("Unsupported API type for testing."); }
                if (response.ok) {
                    ui.updateApiStatus(`${config.modelsMeta[modelToTestWith]?.displayName || modelToTestWith} 金鑰有效。`, "success"); return true;
                } else {
                    let errorMsg = `API 金鑰測試失敗 (${response.status}). `;
                    try { const errorData = await response.json(); errorMsg += errorData.error?.message || JSON.stringify(errorData.error || errorData); } catch (e) { errorMsg += "無法解析錯誤回應。"; }
                    if (response.status === 401 || response.status === 403) errorMsg += " 請檢查您的金鑰權限。";
                    ui.updateApiStatus(errorMsg, "error"); return false;
                }
            } catch (error) { console.error("API Key test connection error:", error); ui.updateApiStatus(`連線錯誤: ${error.message}`, "error"); return false; }
        },
        callApi: async (isRegeneration = false, messageToRegenerateId = null) => {
            const userInputEl = ui.getElement('userInput');
            let userText = userInputEl ? userInputEl.value.trim() : "";
            const currentSession = logic.getCurrentSession();

            if (!currentSession) { ui.showSystemMessage('錯誤：沒有活動的聊天會話。', `error-no-session-${logic.generateMessageId()}`, true); return; }
            if (!state.apiKey) { ui.showSystemMessage('請先連線 API 金鑰。', `error-no-api-${logic.generateMessageId()}`, true); events.handleSidebarToggle(true); return; }
            if (state.isLoading || state.isSummarizing) return;
            if (!isRegeneration && !userText) return;

            const currentModelId = state.currentModel;
            const apiConfig = api.getApiConfigForModel(currentModelId);
            if (!apiConfig) { ui.showSystemMessage(`錯誤：找不到模型 ${currentModelId} 的 API 配置。`, `error-no-apicfg-${logic.generateMessageId()}`, true); return; }

            state.isLoading = true; ui.updateChatInputState(false);
            let messagesForContext = [...currentSession.messages];

            if (isRegeneration && messageToRegenerateId) {
                const assistantMsgIndex = messagesForContext.findIndex(msg => msg.id === messageToRegenerateId);
                if (assistantMsgIndex > 0 && messagesForContext[assistantMsgIndex - 1].role === 'user') {
                    messagesForContext.splice(assistantMsgIndex);
                    const lastUserPrompt = messagesForContext[messagesForContext.length - 1];
                    userText = lastUserPrompt.content;
                } else {
                    console.error("Regeneration error: Could not find valid preceding user message.");
                    ui.showSystemMessage('重新生成失敗：找不到有效的用戶提示。', `error-regen-prompt-${logic.generateMessageId()}`, true);
                    state.isLoading = false; ui.updateChatInputState(true); return;
                }
            } else {
                const userMessageId = logic.generateMessageId();
                const userMessage = { role: 'user', content: userText, id: userMessageId, timestamp: Date.now() };
                logic.addMessageToCurrentSession(userMessage);
                const newMessageElement = ui.renderMessage(userMessage);
                if (newMessageElement && ui.getElement('chatMessages')) ui.getElement('chatMessages').appendChild(newMessageElement);
                if(userInputEl) userInputEl.value = '';
                ui.adjustTextareaHeight(userInputEl);
            }

            ui.scrollToBottom();
            const loadingId = `loading-${logic.generateMessageId()}`;
            ui.showLoadingIndicator(loadingId, isRegeneration ? "AI 重新思考中..." : "AI 思考中...");

            try {
                // System prompt is now purely what the user types in the session settings
                let systemPromptText = currentSession.systemPrompt || config.defaultSystemPromptIfEmpty;
                // REMOVED: Logic to append forceTraditionalChineseSuffix

                let contextMessagesToSend = [];
                // Grok: Add system prompt if available
                if (systemPromptText && apiConfig.type === 'grok') {
                    contextMessagesToSend.push({ role: 'system', content: systemPromptText });
                }
                // Gemini: System prompt handled differently (see below)

                if (currentSession.currentSummary) {
                    contextMessagesToSend.push({ role: apiConfig.type === 'gemini' ? 'user' : 'system', content: `先前對話摘要:\n${currentSession.currentSummary}` });
                    if (apiConfig.type === 'gemini') contextMessagesToSend.push({role: 'model', content: '明白了，摘要已收到。'});
                }

                messagesForContext.forEach(msg => {
                    if (['user', 'assistant'].includes(msg.role)) {
                        let contentForApi = msg.content;
                        if (msg.role === 'user' && currentSession.userName) {
                            contentForApi = `${currentSession.userName}: ${msg.content}`;
                        }
                        contextMessagesToSend.push({
                            role: (apiConfig.type === 'gemini' && msg.role === 'assistant') ? 'model' : msg.role,
                            content: contentForApi
                        });
                    }
                });

                let requestBody;
                let apiUrl = apiConfig.chatUrl;
                let headers = { 'Content-Type': 'application/json' };

                if (apiConfig.type === 'grok') {
                    requestBody = { messages: contextMessagesToSend, model: currentModelId, stream: false, temperature: 0.7 };
                    headers['Authorization'] = `Bearer ${state.apiKey}`;
                } else if (apiConfig.type === 'gemini') {
                    apiUrl = `${apiConfig.chatUrl}?key=${state.apiKey}`;
                    let geminiContents = [];

                    // If systemPromptText exists, and it's the start of the conversation,
                    // prepend it to the first user message for Gemini.
                    // Otherwise, can inject as a separate user/model turn if preferred for non-first turns.
                    const isFirstActualUserMessage = messagesForContext.length === 1 && messagesForContext[0].role === 'user' && !currentSession.currentSummary;

                    if (systemPromptText) {
                        if (isFirstActualUserMessage && contextMessagesToSend.length > 0 && contextMessagesToSend[0].role === 'user') {
                             // Prepend to the *first* user message in contextMessagesToSend
                            const firstUserMsgApi = contextMessagesToSend.shift(); // Take it out
                            geminiContents.push({
                                role: 'user',
                                parts: [{ text: systemPromptText + "\n\n" + firstUserMsgApi.content }]
                            });
                        } else {
                            // Fallback: Send system prompt as its own turn if not first message or complex history
                            geminiContents.push({ role: 'user', parts: [{ text: systemPromptText }] });
                            geminiContents.push({ role: 'model', parts: [{ text: "好的。" }] }); // AI acknowledges
                        }
                    }
                    geminiContents.push(...contextMessagesToSend.map(m => ({ role: m.role, parts: [{ text: m.content }] })));
                    requestBody = { contents: geminiContents, generationConfig: { temperature: 0.7 }};
                } else { throw new Error(`Unsupported API type: ${apiConfig.type}`); }

                const response = await fetch(apiUrl, { method: 'POST', headers: headers, body: JSON.stringify(requestBody) });
                ui.removeElementById(loadingId);

                if (!response.ok) {
                    // ... (error handling same as before) ...
                    let errorText = await response.text(); let errorMessage = `API 請求失敗 (${response.status} ${response.statusText})`;
                    try { const errorJson = JSON.parse(errorText); errorMessage += `: ${errorJson.error?.message || errorJson.message || JSON.stringify(errorJson)}`; } catch (e) { errorMessage += `\n回應: ${errorText}`; }
                    if (response.status === 401 || response.status === 403) { errorMessage += " 金鑰可能已失效或無效。"; logic.clearApiKey(false); }
                    console.error(`API Error (${apiConfig.type.toUpperCase()}):`, errorMessage); ui.showSystemMessage(errorMessage, `error-api-${logic.generateMessageId()}`, true);
                } else {
                    const data = await response.json();
                    let assistantReply = null;
                    if (apiConfig.type === 'grok') {
                        assistantReply = data.choices?.[0]?.message?.content;
                    } else if (apiConfig.type === 'gemini') {
                        assistantReply = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (data.promptFeedback && data.promptFeedback.blockReason) {
                            assistantReply = `[內容被封鎖: ${data.promptFeedback.blockReason}] ${assistantReply || ""}`;
                            console.warn("Gemini content blocked:", data.promptFeedback);
                        }
                    }

                    if (assistantReply !== null) {
                        const assistantMessageId = logic.generateMessageId();
                        const assistantMessage = { role: 'assistant', content: assistantReply, id: assistantMessageId, timestamp: Date.now() };
                        logic.addMessageToCurrentSession(assistantMessage);
                        const newAssistantMsgElement = ui.renderMessage(assistantMessage);
                        if(newAssistantMsgElement && ui.getElement('chatMessages')) ui.getElement('chatMessages').appendChild(newAssistantMsgElement);
                        ui.scrollToBottom();
                        if (!isRegeneration) events.handleAutoSummarizationCheck();
                    } else {
                        ui.showSystemMessage('API 回應格式無效。', `error-api-format-${logic.generateMessageId()}`, true);
                        console.error("Invalid API response format:", data);
                    }
                }
            } catch (error) {
                ui.removeElementById(loadingId);
                console.error("Client-side API call error:", error);
                ui.showSystemMessage(`客戶端錯誤: ${error.message}`, `error-client-${logic.generateMessageId()}`, true);
            } finally {
                state.isLoading = false; ui.updateChatInputState(true);
                if (!isRegeneration && userInputEl) userInputEl.focus();
            }
        },
        summarizeConversation: async (sessionToSummarize) => {
            // ... (same as before, but system prompt for summary is also now just user's input) ...
            if (!sessionToSummarize || state.isSummarizing || !state.apiKey) return null;
            if (sessionToSummarize.messages.filter(m => ['user', 'assistant'].includes(m.role)).length < config.messagesToKeepAfterSummary + 5) {
                console.log("Conversation too short to summarize meaningfully."); return sessionToSummarize.currentSummary || null;
            }
            state.isSummarizing = true;
            ui.updateChatInputState(false, "正在摘要對話，請稍候...");
            ui.showSystemMessage("正在摘要對話...", `system-summarizing-${Date.now()}`);
            const apiConfig = api.getApiConfigForModel(state.currentModel);
            if (!apiConfig) {
                ui.showSystemMessage("摘要失敗：找不到模型配置。", `error-summary-cfg`, true);
                state.isSummarizing = false; ui.updateChatInputState(true); ui.removeElementById(`system-summarizing-${Date.now()}`); return null;
            }
            try {
                const messagesToSummarize = sessionToSummarize.messages.filter(m => ['user', 'assistant'].includes(m.role)).slice(0, -config.messagesToKeepAfterSummary);
                if (messagesToSummarize.length < 5) {
                    console.log("Not enough old messages to summarize."); ui.removeElementById(`system-summarizing-${Date.now()}`);
                    state.isSummarizing = false; ui.updateChatInputState(true); return sessionToSummarize.currentSummary || null;
                }
                let promptForSummary = "請你扮演一個資深的對話分析師，精簡地總結以下對話的關鍵進展、主要討論點、已確認的事實、以及任何重要的角色動態或情緒變化。保持客觀和簡潔，生成的摘要將用於後續對話的上下文參考。\n\n對話記錄如下：\n";
                messagesToSummarize.forEach(msg => { promptForSummary += `${msg.role === 'user' ? (sessionToSummarize.userName || 'User') : 'AI'}: ${msg.content}\n`; });
                promptForSummary += "\n請提供上述對話的摘要：";
                let requestBody; let apiUrl = apiConfig.chatUrl; let headers = { 'Content-Type': 'application/json' };
                let summarySystemPrompt = sessionToSummarize.systemPrompt || ""; // User's general system prompt
                // REMOVED: Logic to append forceTraditionalChineseSuffix to summarySystemPrompt
                if (apiConfig.type === 'grok') {
                    let summaryMessages = [];
                    if (summarySystemPrompt) summaryMessages.push({role: 'system', content: summarySystemPrompt});
                    summaryMessages.push({ role: 'user', content: promptForSummary });
                    requestBody = { messages: summaryMessages, model: state.currentModel, temperature: 0.3 };
                    headers['Authorization'] = `Bearer ${state.apiKey}`;
                } else if (apiConfig.type === 'gemini') {
                    apiUrl = `${apiConfig.chatUrl}?key=${state.apiKey}`;
                    let geminiContents = [];
                    if (summarySystemPrompt) {
                        geminiContents.push({role: 'user', parts: [{text: summarySystemPrompt}]});
                        geminiContents.push({role: 'model', parts: [{text: "好的。"}]});
                    }
                    geminiContents.push({ role: 'user', parts: [{ text: promptForSummary }] });
                    requestBody = { contents: geminiContents, generationConfig: { temperature: 0.3 } };
                } else { throw new Error("Unsupported API for summary."); }
                const response = await fetch(apiUrl, { method: 'POST', headers: headers, body: JSON.stringify(requestBody) });
                ui.removeElementById(`system-summarizing-${Date.now()}`);
                if (!response.ok) { const errorText = await response.text(); throw new Error(`摘要 API 請求失敗 (${response.status}): ${errorText}`); }
                const data = await response.json(); let newSummaryText = null;
                if (apiConfig.type === 'grok' && data.choices?.[0]?.message?.content) newSummaryText = data.choices[0].message.content.trim();
                else if (apiConfig.type === 'gemini' && data.candidates?.[0]?.content?.parts?.[0]?.text) newSummaryText = data.candidates[0].content.parts[0].text.trim();
                if (newSummaryText) {
                    console.log("Generated summary:", newSummaryText);
                    sessionToSummarize.currentSummary = (sessionToSummarize.currentSummary ? sessionToSummarize.currentSummary + "\n\n---\n\n" : "") + newSummaryText;
                    const startIndex = Math.max(0, sessionToSummarize.messages.length - config.messagesToKeepAfterSummary);
                    sessionToSummarize.messages = sessionToSummarize.messages.slice(startIndex);
                    storage.saveSessions();
                    ui.showSystemMessage("對話已摘要並更新上下文。", `system-summary-done-${Date.now()}`);
                    return sessionToSummarize.currentSummary;
                } else { throw new Error("從 API 收到的摘要格式無效。"); }
            } catch (error) {
                console.error("Error during summarization:", error);
                ui.showSystemMessage(`摘要失敗: ${error.message}`, `error-summary-${Date.now()}`, true);
                ui.removeElementById(`system-summarizing-${Date.now()}`);
                return sessionToSummarize.currentSummary || null;
            } finally { state.isSummarizing = false; ui.updateChatInputState(true); }
        }
    };

    // --- Logic Module ---
    const logic = {
        generateSessionId: () => `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        generateMessageId: () => `msg-${state.messageIdCounter++}`,
        getCurrentSession: () => state.sessions.find(s => s.sessionId === state.activeSessionId),
        getCurrentSessionMessages: () => logic.getCurrentSession()?.messages || [],
        addMessageToCurrentSession: (message) => {
            const session = logic.getCurrentSession();
            if (session) {
                if (!message.id) message.id = logic.generateMessageId();
                session.messages.push(message);
                storage.saveSessions();
            } else {
                 console.error("Cannot add message: No active session.");
                 ui.showSystemMessage("錯誤：無法新增訊息，沒有活動的聊天。", `error-addmsg-nosession-${Date.now()}`, true);
            }
        },
        updateMessageInSession: (sessionId, messageId, newContent) => {
            const session = state.sessions.find(s => s.sessionId === sessionId);
            if (!session) return false;
            const message = session.messages.find(m => m.id === messageId);
            if (!message) return false;
            message.content = newContent;
            message.edited = true;
            message.timestamp = Date.now();
            storage.saveSessions();
            return true;
        },
        deleteMessageFromSession: (sessionId, messageId) => {
            const session = state.sessions.find(s => s.sessionId === sessionId);
            if (!session) return false;
            const messageIndex = session.messages.findIndex(m => m.id === messageId);
            if (messageIndex === -1) return false;
            session.messages.splice(messageIndex, 1);
            storage.saveSessions();
            return true;
        },
        deleteSession: (sessionIdToDelete) => {
            const sessionIndex = state.sessions.findIndex(s => s.sessionId === sessionIdToDelete);
            if (sessionIndex === -1) return false;
            state.sessions.splice(sessionIndex, 1);
            if (state.activeSessionId === sessionIdToDelete) {
                state.activeSessionId = null;
                if (state.sessions.length > 0) {
                    logic.activateSession(state.sessions[0].sessionId);
                } else {
                    events.handleNewChat();
                }
            }
            storage.saveSessions();
            if (!state.activeSessionId && state.sessions.length === 0) { /* handled by newChat */ }
            else { storage.saveActiveSessionId(); }
            ui.renderSessionList(); // Ensure list updates even if active session didn't change
            return true;
        },
        renameSession: (sessionId, newName) => {
            const session = state.sessions.find(s => s.sessionId === sessionId);
            if (session && newName.trim() !== "") {
                session.name = newName.trim();
                storage.saveSessions();
                ui.renderSessionList();
                if (sessionId === state.activeSessionId) {
                    const mobileTitleEl = ui.getElement('mobileChatTitle');
                    if(mobileTitleEl) mobileTitleEl.textContent = session.name;
                }
                return true;
            }
            return false;
        },
        clearApiKey: (confirmUser = true) => {
            if (confirmUser && !confirm("確定要清除已儲存的 API 金鑰嗎？")) { return false; }
            state.apiKey = null;
            storage.removeApiKey();
            if(ui.getElement('apiKeyInput')) ui.getElement('apiKeyInput').value = "";
            ui.updateApiStatus("API 金鑰已清除。請輸入新金鑰。", "");
            ui.updateChatInputState(false);
            const clearApiKeyButtonEl = ui.getElement('clearApiKeyButton');
            if (clearApiKeyButtonEl) clearApiKeyButtonEl.style.display = 'none';
            return true;
        },
        saveCurrentSessionSettings: () => {
            const currentSession = logic.getCurrentSession();
            if (!currentSession) { alert("錯誤：沒有活動的聊天會話可儲存設定。"); return; }
            const userNameInputEl = ui.getElement('userNameInput');
            const systemPromptInputEl = ui.getElement('systemPromptInput');
            if (userNameInputEl) currentSession.userName = userNameInputEl.value.trim();
            if (systemPromptInputEl) currentSession.systemPrompt = systemPromptInputEl.value.trim();
            storage.saveSessions();
            ui.showSystemMessage("目前聊天設定已儲存。", `system-settings-saved-${Date.now()}`);
        },
        activateSession: (sessionId) => {
            const sessionToActivate = state.sessions.find(s => s.sessionId === sessionId);
            if (sessionToActivate) {
                state.activeSessionId = sessionId;
                storage.saveActiveSessionId(); // Save new active ID first
                ui.loadSessionUI(sessionId);    // Load content, settings for this session
                ui.renderSessionList();         // THEN, re-render the list to mark it active
                ui.closeSidebarIfMobile();
                const userInputEl = ui.getElement('userInput');
                if (userInputEl) userInputEl.focus();
            } else {
                console.warn(`Session ${sessionId} not found for activation.`);
                if (state.sessions.length > 0) {
                    logic.activateSession(state.sessions[0].sessionId);
                } else {
                    events.handleNewChat();
                }
            }
        }
    };

    // --- Event Handling Module ---
    const events = {
        // ... (All event handlers: handleApiKeyConnection, handleClearApiKey, handleNewChat, etc. remain largely the same structurally)
        // No direct changes needed in most event handlers for these two specific issues,
        // as the fixes are in config, API call logic, and activateSession.
        handleApiKeyConnection: async () => { /* ... as before ... */
            const apiKeyInputEl = ui.getElement('apiKeyInput'); if (!apiKeyInputEl) return; const key = apiKeyInputEl.value.trim(); if (!key) { ui.updateApiStatus("請輸入 API 金鑰。", "error"); return; }
            const success = await api.testApiKey(key);
            if (success) { state.apiKey = key; storage.saveApiKey(); ui.updateChatInputState(true); const btn = ui.getElement('clearApiKeyButton'); if(btn) btn.style.display = 'block'; }
            else { state.apiKey = null; storage.removeApiKey(); ui.updateChatInputState(false); const btn = ui.getElement('clearApiKeyButton'); if(btn) btn.style.display = 'none';}
        },
        handleClearApiKey: () => { logic.clearApiKey(true); },
        handleNewChat: () => {
            if (state.currentEditingMessageId && !confirm("您有未儲存的編輯。確定要開始新聊天嗎？")) { return; }
            if (state.currentEditingMessageId) ui.hideEditUI(document.querySelector(`.message[data-id="${state.currentEditingMessageId}"]`));
            const now = Date.now();
            const modelMeta = config.modelsMeta[state.currentModel] || { displayName: state.currentModel };
            const newSession = {
                sessionId: logic.generateSessionId(),
                name: `與 ${modelMeta.displayName} 的新聊天 (${new Date(now).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })})`,
                userName: ui.getElement('userNameInput')?.value.trim() || '',
                systemPrompt: ui.getElement('systemPromptInput')?.value.trim() || config.defaultSystemPromptIfEmpty,
                currentSummary: '', messages: [], createdAt: now, lastUpdatedAt: now, modelUsedOnCreation: state.currentModel
            };
            state.sessions.unshift(newSession);
            storage.saveSessions(); // Save sessions array with new session
            logic.activateSession(newSession.sessionId); // This will also render the list
        },
        handleSessionSelect: (sessionId) => {
            if (state.currentEditingMessageId && !confirm("您有未儲存的編輯。確定要切換聊天嗎？")) { return; }
            if (state.currentEditingMessageId) ui.hideEditUI(document.querySelector(`.message[data-id="${state.currentEditingMessageId}"]`));
            logic.activateSession(sessionId);
        },
        handleSessionRename: (sessionId) => { /* ... as before ... */
            const sessionItem = document.querySelector(`#chat-session-list li[data-session-id="${sessionId}"] .session-name`); if (!sessionItem) return; ui.hideAllRenameButtons();
            const currentName = state.sessions.find(s => s.sessionId === sessionId)?.name || '';
            sessionItem.innerHTML = `<input type="text" class="session-rename-input" value="${currentName}" style="width: calc(100% - 10px); font-size: inherit; padding: 2px 5px;">`;
            const input = sessionItem.querySelector('.session-rename-input'); input.focus(); input.select();
            const handleRenameConfirm = (e) => {
                if (e.type === 'blur' || (e.type === 'keypress' && e.key === 'Enter')) {
                    const newName = input.value.trim();
                    if (newName && newName !== currentName) { logic.renameSession(sessionId, newName); }
                    else { ui.renderSessionList(); if (sessionId === state.activeSessionId) { const s = state.sessions.find(s => s.sessionId === sessionId); if (s && ui.getElement('mobileChatTitle')) ui.getElement('mobileChatTitle').textContent = s.name; } }
                    input.removeEventListener('blur', handleRenameConfirm); input.removeEventListener('keypress', handleRenameConfirm);
                }
            };
            input.addEventListener('blur', handleRenameConfirm); input.addEventListener('keypress', handleRenameConfirm);
        },
        handleExportChat: () => { /* ... as before ... */
            const currentSession = logic.getCurrentSession(); if (!currentSession) return;
            const exportData = {
                formatVersion: "AIWebChat_v3", sessionId: currentSession.sessionId, name: currentSession.name,
                userName: currentSession.userName, systemPrompt: currentSession.systemPrompt, currentSummary: currentSession.currentSummary,
                modelUsed: currentSession.modelUsedOnCreation || state.currentModel, timestamp: new Date().toISOString(),
                createdAt: currentSession.createdAt, lastUpdatedAt: currentSession.lastUpdatedAt, history: currentSession.messages
            };
            const filename = `AI_Chat_${currentSession.name.replace(/[^a-z0-9]/gi, '_') || currentSession.sessionId.slice(-5)}.json`;
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            ui.showSystemMessage("對話已匯出。", `sys-export-${Date.now()}`);
        },
        handleImportClick: () => { const el = ui.getElement('importFileInput'); if (el) el.click(); },
        handleFileImport: (event) => { /* ... as before ... */
            const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    let sessionToImport = {
                        sessionId: logic.generateSessionId(), name: importedData.name || `導入 ${file.name.split('.')[0]}`,
                        userName: importedData.userName || '', systemPrompt: importedData.systemPrompt || config.defaultSystemPromptIfEmpty,
                        currentSummary: importedData.currentSummary || '', messages: [], createdAt: importedData.createdAt || Date.now(),
                        lastUpdatedAt: importedData.lastUpdatedAt || Date.now(), modelUsedOnCreation: importedData.modelUsed || importedData.modelUsedOnCreation || state.currentModel
                    };
                    if (Array.isArray(importedData.history)) sessionToImport.messages = importedData.history.map(item => ({...item, id: item.id || `imported-${logic.generateMessageId()}`}));
                    else if (Array.isArray(importedData)) sessionToImport.messages = importedData.map(item => ({...item, id: item.id || `imported-${logic.generateMessageId()}`}));
                    else throw new Error('無法識別的檔案格式。');
                    if (sessionToImport.messages.length === 0 && !confirm("匯入的檔案沒有聊天訊息。是否仍要創建一個空的聊天?")) throw new Error('匯入已取消 (無訊息)。');
                    state.sessions.unshift(sessionToImport); storage.saveSessions(); logic.activateSession(sessionToImport.sessionId);
                    ui.showSystemMessage(`成功從 ${file.name} 匯入。`, `system-import-${logic.generateMessageId()}`);
                } catch (error) { console.error("Import error:", error); ui.showSystemMessage(`匯入失敗: ${error.message}`, `error-import-${logic.generateMessageId()}`, true); }
                finally { if (ui.getElement('importFileInput')) ui.getElement('importFileInput').value = ''; ui.closeSidebarIfMobile(); }
            };
            reader.readAsText(file);
        },
        handleDeleteCurrentChat: () => { /* ... as before ... */
            const currentSession = logic.getCurrentSession(); if (!currentSession) { alert("沒有活動的聊天可刪除。"); return; }
            if (confirm(`確定要刪除聊天 "${currentSession.name}" 嗎？此操作無法復原。`)) { logic.deleteSession(currentSession.sessionId); }
        },
        handleThemeToggle: () => { state.currentTheme = state.currentTheme === 'light' ? 'dark' : 'light'; storage.saveTheme(); ui.updateThemeUI(); },
        handleSendMessage: () => { api.callApi(false); },
        handleModelChange: async (showMessage = true) => { /* ... as before ... */
            const modelSelectorEl = ui.getElement('modelSelector'); if (!modelSelectorEl) return; const newModel = modelSelectorEl.value;
            const oldModelType = config.modelsMeta[state.currentModel]?.type; const newModelType = config.modelsMeta[newModel]?.type;
            state.currentModel = newModel; storage.saveModel();
            if (showMessage) { ui.showSystemMessage(`模型已切換至 ${config.modelsMeta[newModel]?.displayName || newModel}。`, `sys-modelchange-${Date.now()}`); }
            if (state.apiKey && oldModelType !== newModelType) {
                ui.updateApiStatus(`模型類型已變更，正在用新模型 (${config.modelsMeta[newModel]?.displayName}) 重新測試金鑰...`, "testing");
                const success = await api.testApiKey(state.apiKey);
                if (!success) { ui.updateApiStatus(`金鑰對新模型 ${config.modelsMeta[newModel]?.displayName} 無效。請檢查金鑰或模型選擇。`, "error"); state.apiKey = null; storage.removeApiKey(); ui.updateChatInputState(false); }
                else { ui.updateChatInputState(true); }
            } else if (!state.apiKey) { ui.updateApiStatus(`請輸入金鑰並連線 (${newModelType || 'API'})`, ""); ui.updateChatInputState(false); }
            else if (state.apiKey && oldModelType === newModelType) { ui.updateApiStatus(`${config.modelsMeta[newModel]?.displayName || newModel} 金鑰已連線。`, "success"); ui.updateChatInputState(true); }
        },
        handleSidebarToggle: (forceOpen = null) => { /* ... as before ... */
            const body = ui.getElement('body'); if (!body) return;
            if (forceOpen === true) body.classList.add('sidebar-open'); else if (forceOpen === false) body.classList.remove('sidebar-open'); else body.classList.toggle('sidebar-open');
        },
        handleCloseSidebar: () => { events.handleSidebarToggle(false); },
        handleTextareaInput: (event) => { ui.adjustTextareaHeight(event.target); },
        handleTextareaKeydown: (event) => { if (event.key === 'Enter' && !event.shiftKey && !state.isLoading) { event.preventDefault(); events.handleSendMessage(); } },
        handleMessageActions: (event) => { /* ... as before ... */
            const target = event.target; const messageElement = target.closest('.message[data-id]');
            if (!messageElement) { if (!target.closest('.message-actions')) { ui.hideAllMessageActions(); } return; }
            if (messageElement.classList.contains('editing')) return;
            const currentlyVisibleActions = document.querySelector('.message.actions-visible');
            if (currentlyVisibleActions && currentlyVisibleActions !== messageElement) { currentlyVisibleActions.classList.remove('actions-visible'); }
            messageElement.classList.toggle('actions-visible');
            const messageId = messageElement.dataset.id; const actionButton = target.closest('.action-button');
            if (actionButton) {
                const currentSession = logic.getCurrentSession(); if (!currentSession) return; const messageData = currentSession.messages.find(msg => msg.id === messageId); if (!messageData) return;
                messageElement.classList.remove('actions-visible');
                if (actionButton.classList.contains('action-copy')) events.handleCopyMessage(messageData.content, actionButton);
                else if (actionButton.classList.contains('action-edit')) events.handleStartEdit(messageElement, messageData.content);
                else if (actionButton.classList.contains('action-delete')) events.handleDeleteMessage(messageId, messageElement);
                else if (actionButton.classList.contains('action-regenerate') && messageData.role === 'assistant') events.handleRegenerateMessage(messageId);
                event.stopPropagation();
            }
        },
        handleRegenerateMessage: (assistantMessageId) => { if (state.isLoading || state.isSummarizing) return; console.log(`Regenerating response for assistant message ID: ${assistantMessageId}`); api.callApi(true, assistantMessageId); },
        handleCopyMessage: (content, buttonElement) => { /* ... as before ... */
            navigator.clipboard.writeText(content).then(() => { const icon = buttonElement.innerHTML; buttonElement.innerHTML = '<i class="fas fa-check"></i>'; setTimeout(() => { buttonElement.innerHTML = icon; }, 1500); })
            .catch(err => { console.error('Failed to copy: ', err); alert('複製失敗!'); });
        },
        handleDeleteMessage: (messageId, messageElement) => { /* ... as before ... */
            if (confirm("確定要刪除這則訊息嗎？")) { const s = logic.getCurrentSession(); if (s && logic.deleteMessageFromSession(s.sessionId, messageId)) messageElement.remove(); else alert("刪除訊息失敗。"); }
        },
        handleStartEdit: (messageElement, rawContent) => { /* ... as before ... */
            if (state.currentEditingMessageId && state.currentEditingMessageId !== messageElement.dataset.id) events.handleCancelEdit(state.currentEditingMessageId, true);
            ui.hideAllMessageActions(); messageElement.classList.add('editing'); state.currentEditingMessageId = messageElement.dataset.id;
            const contentDiv = messageElement.querySelector('.message-content'); contentDiv.style.display = 'none';
            const editArea = document.createElement('div'); editArea.classList.add('inline-edit-area');
            editArea.innerHTML = `<textarea class="inline-edit-textarea"></textarea><div class="inline-edit-controls"><button class="save-edit-button"><i class="fas fa-save"></i> 儲存</button><button class="cancel-edit-button"><i class="fas fa-times"></i> 取消</button></div>`;
            messageElement.appendChild(editArea); const textarea = editArea.querySelector('.inline-edit-textarea'); textarea.value = messageElement.dataset.originalContent || rawContent;
            ui.adjustTextareaHeightForEdit(textarea); textarea.focus(); textarea.select();
            editArea.querySelector('.save-edit-button').addEventListener('click', () => events.handleSaveEdit(messageElement.dataset.id, messageElement));
            editArea.querySelector('.cancel-edit-button').addEventListener('click', () => events.handleCancelEdit(messageElement.dataset.id));
            textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); events.handleSaveEdit(messageElement.dataset.id, messageElement); } else if (e.key === 'Escape') events.handleCancelEdit(messageElement.dataset.id); });
            textarea.addEventListener('input', () => ui.adjustTextareaHeightForEdit(textarea));
        },
        handleSaveEdit: (messageId, messageElement) => { /* ... as before ... */
            const textarea = messageElement.querySelector('.inline-edit-textarea'); if (!textarea) return; const newContent = textarea.value; const currentSession = logic.getCurrentSession();
            if (currentSession && logic.updateMessageInSession(currentSession.sessionId, messageId, newContent)) {
                const updatedMsg = currentSession.messages.find(m => m.id === messageId); const newMsgElement = ui.renderMessage(updatedMsg);
                if (newMsgElement) messageElement.replaceWith(newMsgElement);
            } else alert("儲存編輯失敗。");
            events.handleCancelEdit(messageId, true);
        },
        handleCancelEdit: (messageId, force = false) => { /* ... as before ... */
            const messageElement = document.querySelector(`.message[data-id="${messageId}"]`); if (!messageElement || !messageElement.classList.contains('editing')) return;
            const editArea = messageElement.querySelector('.inline-edit-area'); if (editArea) editArea.remove();
            const contentDiv = messageElement.querySelector('.message-content'); if (contentDiv) contentDiv.style.display = '';
            messageElement.classList.remove('editing'); if (state.currentEditingMessageId === messageId) state.currentEditingMessageId = null;
        },
        handleSessionPressStart: (event) => { /* ... as before ... */ },
        handleSessionPressEnd: (event) => { clearTimeout(state.longPressTimer); },
        handleDocumentClickForHideRename: (event) => { /* ... as before ... */
            const activeRenameInput = document.querySelector('#chat-session-list .session-rename-input'); if (activeRenameInput && !activeRenameInput.contains(event.target)) activeRenameInput.blur();
            const sessionList = ui.getElement('chatSessionList'); if (sessionList && !sessionList.contains(event.target)) ui.hideAllRenameButtons();
        },
        handleSaveSessionSettingsClick: () => { logic.saveCurrentSessionSettings(); ui.closeSidebarIfMobile(); },
        handleSummarizeChatClick: async () => { /* ... as before ... */
            const currentSession = logic.getCurrentSession(); if (!currentSession) { alert("沒有活動的聊天可摘要。"); return; }
            if (confirm("確定要摘要目前對話嗎？這將替換較早的訊息並更新上下文。")) { ui.closeSidebarIfMobile(); await api.summarizeConversation(currentSession); ui.renderMessages(currentSession.messages); }
        },
        handleAutoSummarizationCheck: () => { /* ... as before ... */
            const currentSession = logic.getCurrentSession(); if (!currentSession || state.isSummarizing) return;
            const messageCount = currentSession.messages.filter(m => ['user', 'assistant'].includes(m.role)).length;
            if (messageCount >= config.summarizationTriggerThreshold) {
                const timeSinceLastSummary = currentSession.lastSummaryAt ? Date.now() - currentSession.lastSummaryAt : Infinity;
                const messagesSinceLastSummary = currentSession.messagesSinceLastSummary || messageCount;
                if (messagesSinceLastSummary >= (config.summarizationTriggerThreshold / 2) || timeSinceLastSummary > 10 * 60 * 1000) {
                    if (confirm(`目前對話較長 (${messageCount} 則訊息)，是否需要摘要以優化效能和上下文？`)) {
                        api.summarizeConversation(currentSession).then((newSummary) => {
                            if (newSummary) { currentSession.lastSummaryAt = Date.now(); currentSession.messagesSinceLastSummary = 0; ui.renderMessages(currentSession.messages); }
                        });
                    }
                }
            } else { if (currentSession) currentSession.messagesSinceLastSummary = (currentSession.messagesSinceLastSummary || 0) + 1; }
        }
    };

    // --- App Initialization ---
    function setupEventListeners() {
        // API Section
        const connectApiButton = ui.getElement('connectApiButton'); if (connectApiButton) connectApiButton.addEventListener('click', events.handleApiKeyConnection);
        const clearApiKeyButton = ui.getElement('clearApiKeyButton'); if (clearApiKeyButton) clearApiKeyButton.addEventListener('click', events.handleClearApiKey);
        const apiKeyInput = ui.getElement('apiKeyInput'); if (apiKeyInput) apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') events.handleApiKeyConnection(); });
        // Session Settings
        const saveSessionSettingsButton = ui.getElement('saveSessionSettingsButton'); if (saveSessionSettingsButton) saveSessionSettingsButton.addEventListener('click', events.handleSaveSessionSettingsClick);
        // Chat Session List
        const newChatButton = ui.getElement('newChatButton'); if (newChatButton) newChatButton.addEventListener('click', events.handleNewChat);
        const chatSessionList = ui.getElement('chatSessionList');
        if (chatSessionList) {
            chatSessionList.addEventListener('click', (event) => {
                const target = event.target; const sessionItem = target.closest('li[data-session-id]'); const renameButton = target.closest('.session-rename-button');
                if (renameButton && sessionItem) { event.stopPropagation(); events.handleSessionRename(sessionItem.dataset.sessionId); }
                else if (sessionItem && !target.closest('.session-rename-input')) { events.handleSessionSelect(sessionItem.dataset.sessionId); }
            });
        }
        document.addEventListener('click', events.handleDocumentClickForHideRename);
        // Model Selector
        const modelSelector = ui.getElement('modelSelector'); if (modelSelector) modelSelector.addEventListener('change', () => events.handleModelChange(true));
        // Action Buttons
        const summarizeChatButton = ui.getElement('summarizeChatButton'); if (summarizeChatButton) summarizeChatButton.addEventListener('click', events.handleSummarizeChatClick);
        const exportButton = ui.getElement('exportButton'); if (exportButton) exportButton.addEventListener('click', events.handleExportChat);
        const importButton = ui.getElement('importButton'); if (importButton) importButton.addEventListener('click', events.handleImportClick);
        const importFileInput = ui.getElement('importFileInput'); if (importFileInput) importFileInput.addEventListener('change', events.handleFileImport);
        const deleteCurrentChatButton = ui.getElement('deleteCurrentChatButton'); if (deleteCurrentChatButton) deleteCurrentChatButton.addEventListener('click', events.handleDeleteCurrentChat);
        // Theme Toggle
        const themeToggleButton = ui.getElement('themeToggleButton'); if (themeToggleButton) themeToggleButton.addEventListener('click', events.handleThemeToggle);
        // Sidebar Mobile Controls
        const menuToggleButton = ui.getElement('menuToggleButton'); if (menuToggleButton) menuToggleButton.addEventListener('click', () => events.handleSidebarToggle());
        const sidebarOverlay = ui.getElement('sidebarOverlay'); if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => events.handleSidebarToggle(false));
        const closeSidebarButton = ui.getElement('closeSidebarButton'); if (closeSidebarButton) closeSidebarButton.addEventListener('click', () => events.handleSidebarToggle(false));
        // Main Chat Area
        const chatMessages = ui.getElement('chatMessages'); if (chatMessages) chatMessages.addEventListener('click', events.handleMessageActions);
        const userInput = ui.getElement('userInput');
        if (userInput) { userInput.addEventListener('input', events.handleTextareaInput); userInput.addEventListener('keydown', events.handleTextareaKeydown); }
        const sendButton = ui.getElement('sendButton'); if (sendButton) sendButton.addEventListener('click', events.handleSendMessage);
    }

    function initializeChat() {
        console.log("Initializing Enhanced AI Chat...");
        state.currentTheme = storage.loadTheme();
        state.apiKey = storage.loadApiKey();
        state.currentModel = storage.loadModel();

        ui.populateModelSelector();
        const modelSelectorEl = ui.getElement('modelSelector');
        if (modelSelectorEl) modelSelectorEl.value = state.currentModel;

        const sessionsLoaded = storage.loadSessions();
        if (!sessionsLoaded || state.sessions.length === 0) {
            events.handleNewChat(); // Creates a session, then activateSession handles UI load & list render
        } else {
            let lastActiveId = storage.loadActiveSessionId();
            if (!lastActiveId || !state.sessions.some(s => s.sessionId === lastActiveId)) {
                lastActiveId = state.sessions[0]?.sessionId;
            }
            if (lastActiveId) {
                logic.activateSession(lastActiveId); // Handles UI load & list render
            } else {
                events.handleNewChat(); // Fallback, handles UI load & list render
            }
        }
        ui.updateThemeUI();

        const currentModelMeta = config.modelsMeta[state.currentModel] || { type: '未知', displayName: state.currentModel };
        if (state.apiKey) {
            const apiKeyInputEl = ui.getElement('apiKeyInput');
            if (apiKeyInputEl) apiKeyInputEl.value = state.apiKey;
            ui.updateApiStatus(`金鑰已載入 (${currentModelMeta.displayName})。點擊連線以測試。`, "loaded");
            ui.updateChatInputState(true);
        } else {
             ui.updateApiStatus("請輸入金鑰並連線 (" + (currentModelMeta.displayName || 'API') + ")", "");
             ui.updateChatInputState(false);
        }
        ui.adjustTextareaHeight();
        setupEventListeners();
        console.log("Enhanced AI Chat initialization complete.");
    }

    initializeChat();
});
