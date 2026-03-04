/**
 * Boss Agent Chrome Extension - Side Panel JavaScript
 */

// =============================================================================
// DOM Elements
// =============================================================================

const elements = {
    // Status
    status: document.getElementById('status'),
    statusText: document.querySelector('.status-text'),
    toolsCount: document.getElementById('tools-count'),

    // Chat
    chatContainer: document.getElementById('chat-container'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    clearChatBtn: document.getElementById('clear-chat'),
    settingsBtn: document.getElementById('settings-btn'),

    // Tools
    toolsBtn: document.getElementById('tools-btn'),
    toolsPanel: document.getElementById('tools-panel'),
    closeToolsBtn: document.getElementById('close-tools'),
    toolsSearch: document.getElementById('tools-search'),
    toolsList: document.getElementById('tools-list'),

    // Quick Prompts
    quickPrompts: document.querySelectorAll('.quick-prompt'),

    // CRE Toggle
    toggleCreBtn: document.getElementById('toggle-cre'),
    crePanel: document.getElementById('cre-panel')
};

// =============================================================================
// State
// =============================================================================

let conversationId = null;
let isStreaming = false;
let availableTools = {};

// =============================================================================
// Utility Functions
// =============================================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatContent(content) {
    let escaped = escapeHtml(content);

    // Code blocks
    escaped = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, function(_match, lang, code) {
        return `<pre><code class="language-${escapeHtml(lang)}">${code}</code></pre>`;
    });

    // Inline code
    escaped = escaped.replace(/`([^`]+)`/g, '<span class="inline-code">$1</span>');

    // Bold
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Line breaks
    escaped = escaped.replace(/\n/g, '<br>');

    return escaped;
}

function addMessage(role, content, streaming = false) {
    // Remove welcome message if exists
    const welcome = elements.chatContainer.querySelector('.welcome');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = `message ${role}`;
    if (streaming) div.classList.add('streaming');
    div.innerHTML = formatContent(content);

    elements.chatContainer.appendChild(div);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;

    return div;
}

function updateMessage(element, content) {
    element.innerHTML = formatContent(content);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

function setInputEnabled(enabled) {
    elements.messageInput.disabled = !enabled;
    elements.sendBtn.disabled = !enabled;
}

// =============================================================================
// API Communication
// =============================================================================

async function sendMessage(type, data = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type, ...data }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (!response.success) {
                reject(new Error(response.error || 'Unknown error'));
            } else {
                resolve(response.data);
            }
        });
    });
}

async function checkHealth() {
    try {
        const health = await sendMessage('CHECK_HEALTH');
        elements.status.className = 'status connected';
        elements.statusText.textContent = 'Connected';
        return true;
    } catch (error) {
        elements.status.className = 'status error';
        elements.statusText.textContent = 'Disconnected';
        console.error('Health check failed:', error);
        return false;
    }
}

function normalizeToolsResponse(rawTools) {
    if (!rawTools) {
        return {};
    }

    const toolList = Array.isArray(rawTools)
        ? rawTools
        : (Array.isArray(rawTools.tools) ? rawTools.tools : []);

    const normalized = {};
    for (const tool of toolList) {
        if (!tool?.name) continue;
        normalized[tool.name] = {
            name: tool.name,
            description: tool.description || 'No description provided',
            category: tool.category || 'MCP'
        };
    }
    return normalized;
}

async function loadTools() {
    try {
        const toolsResponse = await sendMessage('GET_TOOLS');
        const normalized = normalizeToolsResponse(toolsResponse);

        // Fall back to built-in financial tool registry if API tools are unavailable.
        if (Object.keys(normalized).length === 0) {
            const fallbackTools = await sendMessage('GET_FINANCIAL_TOOLS');
            availableTools = fallbackTools;
        } else {
            availableTools = normalized;
        }

        const count = Object.keys(availableTools).length;
        elements.toolsCount.textContent = `${count} tools available`;
        renderToolsList(availableTools);
    } catch (error) {
        console.error('Failed to load tools:', error);
        elements.toolsCount.textContent = 'Tools unavailable';
    }
}

async function chat(message) {
    if (isStreaming) return;
    isStreaming = true;
    setInputEnabled(false);

    // Add user message
    addMessage('user', message);
    elements.messageInput.value = '';

    // Create streaming message placeholder
    const agentMessage = addMessage('agent', '', true);

    try {
        // Use port for streaming
        const port = chrome.runtime.connect({ name: 'stream-chat' });
        let content = '';

        port.onMessage.addListener((msg) => {
            switch (msg.type) {
                case 'TOKEN':
                    content += msg.token;
                    updateMessage(agentMessage, content);
                    break;

                case 'COMPLETE':
                    conversationId = msg.conversationId;
                    agentMessage.classList.remove('streaming');
                    isStreaming = false;
                    setInputEnabled(true);
                    elements.messageInput.focus();
                    break;

                case 'ERROR':
                    agentMessage.classList.remove('streaming');
                    agentMessage.classList.add('error');
                    agentMessage.textContent = `Error: ${msg.error}`;
                    isStreaming = false;
                    setInputEnabled(true);
                    break;
            }
        });

        port.postMessage({
            type: 'START_STREAM',
            message,
            conversationId
        });
    } catch (error) {
        agentMessage.classList.remove('streaming');
        agentMessage.classList.add('error');
        agentMessage.textContent = `Error: ${error.message}`;
        isStreaming = false;
        setInputEnabled(true);
    }
}

async function invokeTool(toolName, params = {}) {
    try {
        return await sendMessage('INVOKE_TOOL', { tool: toolName, params });
    } catch (error) {
        throw error;
    }
}

// =============================================================================
// Tools Panel
// =============================================================================

function renderToolsList(tools, filter = '') {
    elements.toolsList.innerHTML = '';

    // Group tools by category
    const categories = {};
    for (const [id, tool] of Object.entries(tools)) {
        if (filter && !tool.name.toLowerCase().includes(filter) &&
            !tool.description.toLowerCase().includes(filter)) {
            continue;
        }

        const category = tool.category || 'Other';
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push({ id, ...tool });
    }

    // Render categories
    for (const [category, categoryTools] of Object.entries(categories)) {
        const header = document.createElement('div');
        header.className = 'tool-category-header';
        header.textContent = category;
        elements.toolsList.appendChild(header);

        for (const tool of categoryTools) {
            const item = document.createElement('div');
            item.className = 'tool-item';
            item.dataset.tool = tool.id;

            // Get icon from first letter of category
            const iconLetter = tool.category ? tool.category[0].toUpperCase() : '?';

            item.innerHTML = `
                <div class="tool-icon">${iconLetter}</div>
                <div class="tool-info">
                    <div class="tool-name">${escapeHtml(tool.name)}</div>
                    <div class="tool-desc">${escapeHtml(tool.description)}</div>
                </div>
            `;

            item.addEventListener('click', () => {
                insertToolPrompt(tool);
            });

            elements.toolsList.appendChild(item);
        }
    }

    if (elements.toolsList.children.length === 0) {
        elements.toolsList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No tools found</div>';
    }
}

function insertToolPrompt(tool) {
    const prompt = `Use the ${tool.name} tool to `;
    elements.messageInput.value = prompt;
    elements.messageInput.focus();
    closeToolsPanel();
}

function openToolsPanel() {
    elements.toolsPanel.classList.add('open');
}

function closeToolsPanel() {
    elements.toolsPanel.classList.remove('open');
}

// =============================================================================
// Auto-resize Textarea
// =============================================================================

function autoResizeTextarea() {
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 120) + 'px';
}

// =============================================================================
// Event Handlers
// =============================================================================

// Send message
elements.sendBtn.addEventListener('click', () => {
    const message = elements.messageInput.value.trim();
    if (message && !isStreaming) {
        chat(message);
    }
});

elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const message = elements.messageInput.value.trim();
        if (message && !isStreaming) {
            chat(message);
        }
    }
});

elements.messageInput.addEventListener('input', autoResizeTextarea);

// Clear chat
elements.clearChatBtn.addEventListener('click', () => {
    elements.chatContainer.innerHTML = `
        <div class="welcome">
            <div class="welcome-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                </svg>
            </div>
            <h2>Boss Agent</h2>
            <p>AI-powered financial models and marketing intelligence</p>
            <div class="quick-prompts">
                <button class="quick-prompt" data-prompt="Predict LTV for a customer">Predict LTV</button>
                <button class="quick-prompt" data-prompt="Optimize my Target ROAS">Optimize ROAS</button>
                <button class="quick-prompt" data-prompt="Estimate CATE for treatment effect">Estimate CATE</button>
                <button class="quick-prompt" data-prompt="Show me the top uplift cohort">Export Uplift Cohort</button>
            </div>
        </div>
    `;
    conversationId = null;

    // Re-attach quick prompt listeners
    document.querySelectorAll('.quick-prompt').forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.dataset.prompt;
            if (prompt) {
                elements.messageInput.value = prompt;
                elements.messageInput.focus();
            }
        });
    });
});

// Settings
elements.settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

// Tools panel
elements.toolsBtn.addEventListener('click', openToolsPanel);
elements.closeToolsBtn.addEventListener('click', closeToolsPanel);

// Tools search
elements.toolsSearch.addEventListener('input', (e) => {
    const filter = e.target.value.toLowerCase();
    renderToolsList(availableTools, filter);
});

// CRE Deals Panel
if (elements.toggleCreBtn && elements.crePanel) {
    elements.toggleCreBtn.addEventListener('click', () => {
        if (elements.crePanel.style.display === 'none') {
            elements.crePanel.style.display = 'block';
            elements.toggleCreBtn.style.background = '#38a169'; // Highlight when active
        } else {
            elements.crePanel.style.display = 'none';
            elements.toggleCreBtn.style.background = '#000'; // Reset
        }
    });
}


// Quick prompts
elements.quickPrompts.forEach(btn => {
    btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt;
        if (prompt) {
            elements.messageInput.value = prompt;
            elements.messageInput.focus();
        }
    });
});

// Close tools panel on outside click
document.addEventListener('click', (e) => {
    if (elements.toolsPanel.classList.contains('open') &&
        !elements.toolsPanel.contains(e.target) &&
        e.target !== elements.toolsBtn &&
        !elements.toolsBtn.contains(e.target)) {
        closeToolsPanel();
    }
});

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Check health on load
    await checkHealth();

    // Load available tools
    await loadTools();

    // Focus input
    elements.messageInput.focus();

    // Auto-reconnect health check
    setInterval(async () => {
        await checkHealth();
    }, 30000);
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'CHAT_MESSAGE') {
        chat(request.message);
    }
});
