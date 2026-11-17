/**
 * AI智能伴侣 - 前端交互逻辑
 */

// ==================== 全局状态 ====================
const state = {
    currentSession: null,
    messages: [],
    nickName: '小甜甜',
    nature: '活泼开朗的东北姑娘',
    isLoading: false
};

// API 基础URL
const API_BASE_URL = '/api';

// ==================== DOM 元素 ====================
const elements = {
    sessionList: document.querySelector('#sessionList'),
    chatMessages: document.querySelector('#chatMessages'),
    chatInput: document.querySelector('#chatInput'),
    sendBtn: document.querySelector('#sendBtn'),
    newSessionBtn: document.querySelector('#newSessionBtn'),
    sessionName: document.querySelector('#sessionName'),
    nickName: document.querySelector('#nickName'),
    nature: document.querySelector('#nature'),
    themeBtn: document.querySelector('#themeBtn'),
    themeDropdown: document.querySelector('#themeDropdown'),
    presetSelect: document.querySelector('#presetSelect')
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    await init();
});

async function init() {
    // 绑定事件监听器
    bindEventListeners();

    // 加载预设列表
    await loadPresets();

    // 睡眠500ms
    await new Promise(resolve => setTimeout(resolve, 300));

    // 加载会话列表
    await loadSessionList();
    
    // 如果没有当前会话，创建一个新会话
    if (!state.currentSession) {
        await createNewSession();
    }
}

function bindEventListeners() {
    // 发送消息
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // 新建会话
    elements.newSessionBtn.addEventListener('click', async () => {
        await createNewSession();
    });
    
    // 预设选择
    elements.presetSelect.addEventListener('change', (e) => {
        handlePresetChange(e.target.value);
    });
    
    // 伴侣信息变更
    elements.nickName.addEventListener('change', (e) => {
        state.nickName = e.target.value || '小甜甜';
        // 根据当前的昵称和性格查找匹配的预设
        updatePresetSelection();
    });
    
    elements.nature.addEventListener('change', (e) => {
        state.nature = e.target.value || '活泼开朗的东北姑娘';
        // 根据当前的昵称和性格查找匹配的预设
        updatePresetSelection();
    });
    
    // 主题切换
    bindThemeSwitcher();
}

// ==================== 主题切换功能 ====================

function bindThemeSwitcher() {
    // 点击主题按钮显示/隐藏下拉菜单
    elements.themeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.themeDropdown.classList.toggle('show');
    });
    
    // 点击页面其他地方关闭下拉菜单
    document.addEventListener('click', () => {
        elements.themeDropdown.classList.remove('show');
    });
    
    // 点击下拉菜单内部不关闭
    elements.themeDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // 主题选项点击事件
    const themeOptions = elements.themeDropdown.querySelectorAll('.theme-option');
    themeOptions.forEach(option => {
        option.addEventListener('click', () => {
            const theme = option.dataset.theme;
            applyTheme(theme);
            elements.themeDropdown.classList.remove('show');
        });
    });
    
    // 加载保存的主题
    loadSavedTheme();
}

function applyTheme(theme) {
    // 移除所有主题类
    document.body.classList.remove('theme-dark');
    
    // 应用新主题
    if (theme === 'dark') {
        document.body.classList.add('theme-dark');
    }
    // light 主题不需要添加类，使用默认样式
    
    // 保存主题到本地存储
    localStorage.setItem('ai-companion-theme', theme);
    
    // 更新选中状态（使用requestAnimationFrame确保DOM更新完成）
    requestAnimationFrame(() => {
        updateThemeSelection(theme);
    });
}

function updateThemeSelection(theme) {
    // 移除所有选中状态
    const themeOptions = elements.themeDropdown.querySelectorAll('.theme-option');
    themeOptions.forEach(option => {
        option.classList.remove('active');
    });
    
    // 为当前主题添加选中状态
    const activeOption = elements.themeDropdown.querySelector(`[data-theme="${theme}"]`);
    if (activeOption) {
        activeOption.classList.add('active');
    }
}

function loadSavedTheme() {
    const savedTheme = localStorage.getItem('ai-companion-theme') || 'light';
    // 直接应用主题并更新选中状态
    applyTheme(savedTheme);
}

async function loadSessionList() {
    try {
        const response = await fetch(`${API_BASE_URL}/sessions`);
        const result = await response.json();
        
        if (result.code !== 200) {
            throw new Error(result.message || '加载会话列表失败');
        }
        
        const sessions = result.data;
        renderSessionList(sessions);
        
        // 如果有会话，且当前没有激活的会话，才加载最新的一个
        if (sessions.length > 0 && !state.currentSession) {
            await loadSession(sessions[0], false);
            // 加载完会话后，重新渲染列表以更新高亮状态
            renderSessionList(sessions);
        }
        
        return sessions;
    } catch (error) {
        console.error('加载会话列表失败:', error);
        showError('加载会话列表失败');
        return [];
    }
}

function renderSessionList(sessions) {
    elements.sessionList.innerHTML = '';
    
    sessions.forEach(sessionId => {
        const sessionItem = document.createElement('div');
        sessionItem.className = 'session-item';
        
        const isActive = sessionId === state.currentSession;
        
        sessionItem.innerHTML = `
            <button class="session-btn ${isActive ? 'btn-active' : 'btn-secondary'}" 
                    data-session="${sessionId}">
                ${sessionId}
            </button>
            <button class="btn btn-icon" data-delete="${sessionId}" title="删除会话">❌️</button>
        `;
        
        // 加载会话事件
        const loadBtn = sessionItem.querySelector(`[data-session="${sessionId}"]`);
        loadBtn.addEventListener('click', async () => {
            await loadSession(sessionId, false);
            // 直接更新按钮高亮状态，不需要重新查询服务端
            const buttons = elements.sessionList.querySelectorAll('.session-btn');
            buttons.forEach(btn => {
                if (btn.dataset.session === sessionId) {
                    btn.className = 'session-btn btn-active';
                } else {
                    btn.className = 'session-btn btn-secondary';
                }
            });
        });
        
        // 删除会话事件
        const deleteBtn = sessionItem.querySelector(`[data-delete="${sessionId}"]`);
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSession(sessionId);
        });
        
        elements.sessionList.appendChild(sessionItem);
    });
}

async function loadSession(sessionId, refreshList = true) {
    try {
        const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`);
        const result = await response.json();
        
        if (result.code !== 200) {
            throw new Error(result.message || '会话不存在');
        }
        
        const sessionData = result.data;
        
        // 更新状态
        state.currentSession = sessionId;
        state.messages = sessionData.messages || [];
        state.nickName = sessionData.nick_name || '小甜甜';
        state.nature = sessionData.nature || '活泼开朗的东北姑娘';
        
        // 更新UI
        elements.nickName.value = state.nickName;
        elements.nature.value = state.nature;
        elements.sessionName.textContent = `会话名称: ${sessionId}`;
        
        // 渲染消息
        renderMessages();
        
        // 刷新会话列表以更新激活状态
        if (refreshList) {
            await new Promise(resolve => setTimeout(resolve, 300));
            await loadSessionList();
        }
        
    } catch (error) {
        console.error('加载会话失败:', error);
        showError('加载会话失败');
    }
}

async function createNewSession() {
    // 检查当前会话是否为空（无任何消息内容）
    if (state.currentSession && state.messages.length === 0) {
        alert('当前会话尚未开始，无需创建新会话');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nick_name: state.nickName,
                nature: state.nature
            })
        });
        
        const result = await response.json();
        
        if (result.code !== 200) {
            throw new Error(result.message || '创建会话失败');
        }
        
        // 更新状态（直接使用前端已有的数据，无需服务端返回）
        state.currentSession = result.data;
        state.messages = [];
        
        // 更新UI
        elements.sessionName.textContent = `会话名称: ${state.currentSession}`;
        renderMessages();

        await new Promise(resolve => setTimeout(resolve, 300));

        // 刷新会话列表（只刷新列表，不触发 loadSession）
        await loadSessionList();
        
    } catch (error) {
        console.error('创建会话失败:', error);
        showError('创建会话失败');
    }
}

async function deleteSession(sessionId) {
    if (!confirm(`确定要删除会话 "${sessionId}" 吗？`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.code !== 200) {
            throw new Error(result.message || '删除失败');
        }

        await new Promise(resolve => setTimeout(resolve, 300));

        // 如果删除的是当前会话，重置状态并加载第一个会话
        if (sessionId === state.currentSession) {
            state.currentSession = null;
            state.messages = [];
            
            // 获取最新的会话列表
            const sessionsResponse = await fetch(`${API_BASE_URL}/sessions`);
            const sessionsResult = await sessionsResponse.json();
            
            if (sessionsResult.code === 200 && sessionsResult.data.length > 0) {
                // 加载第一个会话（不触发重复刷新列表）
                await loadSession(sessionsResult.data[0], false);
                // 手动刷新列表以更新选中状态
                renderSessionList(sessionsResult.data);
            } else {
                // 没有会话了，清空UI
                elements.sessionName.textContent = '会话名称: ';
                renderMessages();
                renderSessionList([]);
            }
        } else {
            // 删除的不是当前会话，只刷新列表
            await loadSessionList();
        }
        
    } catch (error) {
        console.error('删除会话失败:', error);
        showError('删除会话失败');
    }
}

// ==================== 消息管理 ====================

function renderMessages() {
    elements.chatMessages.innerHTML = '';
    
    if (state.messages.length === 0) {
        elements.chatMessages.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <div class="empty-state-text">开始与AI伴侣对话吧~</div>
            </div>
        `;
        return;
    }
    
    state.messages.forEach(msg => {
        if (msg.role === 'system') return; // 跳过系统提示词，不渲染
        appendMessageToUI(msg.role, msg.content);
    });
    
    scrollToBottom();
}

function appendMessageToUI(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = role === 'user' ? '🫠' : '🤖';
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">${escapeHtml(content)}</div>
    `;
    
    // 如果是空状态，先清空
    const emptyState = elements.chatMessages.querySelector('.empty-state');
    if (emptyState) {
        elements.chatMessages.innerHTML = '';
    }
    
    elements.chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function showLoading() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant loading-message';
    loadingDiv.id = 'loadingIndicator';
    loadingDiv.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-content">
            <div class="loading">
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
            </div>
        </div>
    `;
    elements.chatMessages.appendChild(loadingDiv);
    scrollToBottom();
}

function hideLoading() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

function scrollToBottom() {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// ==================== 聊天功能 ====================

async function sendMessage() {
    const message = elements.chatInput.value.trim();
    
    if (!message || state.isLoading) {
        return;
    }
    
    // 清空输入框
    elements.chatInput.value = '';
    
    // 添加用户消息到UI
    appendMessageToUI('user', message);
    
    // 保存到状态
    state.messages.push({ role: 'user', content: message });
    
    // 显示加载状态
    state.isLoading = true;
    showLoading();
    
    try {
        // 调用API（服务端会根据session_name自动加载聊天记录并保存）
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_name: state.currentSession,
                message: message,
                nick_name: state.nickName,
                nature: state.nature
            })
        });
        
        const result = await response.json();
        
        if (result.code !== 200) {
            throw new Error(result.message || 'AI响应失败');
        }
        
        // 隐藏加载状态
        hideLoading();
        
        // 添加AI回复到UI
        appendMessageToUI('assistant', result.data);
        
        // 保存到状态
        state.messages.push({ role: 'assistant', content: result.data });
        
    } catch (error) {
        console.error('发送消息失败:', error);
        hideLoading();
        showError('发送消息失败，请重试');
        
        // 移除失败的用户消息
        state.messages.pop();
        renderMessages();
    } finally {
        state.isLoading = false;
    }
}

// ==================== 工具函数 ====================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    // 简单的错误提示，可以替换为更好的UI
    alert(message);
}

// ==================== 预设管理 ====================

// 存储预设数据的全局变量
let presetsData = [];

async function loadPresets() {
    try {
        const response = await fetch(`${API_BASE_URL}/presets`);
        const result = await response.json();
        
        if (result.code !== 200) {
            throw new Error(result.message || '加载预设列表失败');
        }
        
        presetsData = result.data;
        renderPresetSelect(presetsData);
        
    } catch (error) {
        console.error('加载预设列表失败:', error);
        elements.presetSelect.innerHTML = '<option value="">加载失败</option>';
    }
}

function renderPresetSelect(presets) {
    elements.presetSelect.innerHTML = '';
    
    // 添加所有预设选项
    presets.forEach((preset, index) => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        elements.presetSelect.appendChild(option);
    });
    
    // 默认选中第一个预设（如果有）
    if (presets.length > 0) {
        elements.presetSelect.value = presets[0].id;
        handlePresetChange(presets[0].id);
    }
}

function handlePresetChange(presetId) {
    if (!presetId) {
        return;
    }
    
    const preset = presetsData.find(p => p.id == presetId);
    if (preset) {
        state.nickName = preset.nick_name;
        state.nature = preset.nature;
        
        elements.nickName.value = preset.nick_name;
        elements.nature.value = preset.nature;
    }
}

