/**
 * Boss Agent Chrome Extension - Popup JavaScript
 */

// =============================================================================
// DOM Elements
// =============================================================================

const elements = {
    // Status
    status: document.getElementById('status'),
    statusText: document.querySelector('.status-text'),
    version: document.getElementById('version'),

    // Tabs
    tabs: document.querySelectorAll('.tab'),
    tabContents: document.querySelectorAll('.tab-content'),

    // Chat
    chatContainer: document.getElementById('chat-container'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),

    // Tools
    toolBtns: document.querySelectorAll('.tool-btn'),

    // Quick Actions
    ltvCustomerId: document.getElementById('ltv-customer-id'),
    ltvModelType: document.getElementById('ltv-model-type'),
    predictLtvBtn: document.getElementById('predict-ltv-btn'),
    ltvResult: document.getElementById('ltv-result'),

    roasCampaignId: document.getElementById('roas-campaign-id'),
    roasLookback: document.getElementById('roas-lookback'),
    optimizeRoasBtn: document.getElementById('optimize-roas-btn'),
    roasResult: document.getElementById('roas-result'),

    cateSubjectId: document.getElementById('cate-subject-id'),
    cateFeatures: document.getElementById('cate-features'),
    estimateCateBtn: document.getElementById('estimate-cate-btn'),
    cateResult: document.getElementById('cate-result'),

    riskUserId: document.getElementById('risk-user-id'),
    riskWindow: document.getElementById('risk-window'),
    computeRiskBtn: document.getElementById('compute-risk-btn'),
    riskResult: document.getElementById('risk-result'),

    // Footer
    openSidepanelBtn: document.getElementById('open-sidepanel'),
    openOptionsBtn: document.getElementById('open-options'),

    // Modal
    modal: document.getElementById('tool-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalDescription: document.getElementById('modal-description'),
    modalParams: document.getElementById('modal-params'),
    modalClose: document.getElementById('modal-close'),
    modalCancel: document.getElementById('modal-cancel'),
    modalInvoke: document.getElementById('modal-invoke')
};

// =============================================================================
// State
// =============================================================================

let conversationId = null;
let isStreaming = false;
let currentTool = null;

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
    escaped = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre><code class="language-${escapeHtml(lang)}">${code}</code></pre>`;
    });

    // Inline code
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Line breaks
    escaped = escaped.replace(/\n/g, '<br>');

    return escaped;
}

function addMessage(role, content, streaming = false) {
    const welcome = elements.chatContainer.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = `message ${role}`;
    if (streaming) div.classList.add('streaming');
    div.innerHTML = formatContent(content);

    elements.chatContainer.appendChild(div);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;

    return div;
}

function setLoading(element, loading) {
    if (loading) {
        element.disabled = true;
        element.dataset.originalText = element.textContent;
        element.innerHTML = '<span class="loading"></span>';
    } else {
        element.disabled = false;
        element.textContent = element.dataset.originalText || element.textContent;
    }
}

function showResult(element, content, isError = false) {
    element.textContent = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
    element.className = `result ${isError ? 'error' : 'success'}`;
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
        elements.statusText.textContent = `Connected v${health.version}`;
        elements.version.textContent = `v${health.version}`;
        return true;
    } catch (error) {
        elements.status.className = 'status error';
        elements.statusText.textContent = 'Disconnected';
        console.error('Health check failed:', error);
        return false;
    }
}

async function chat(message) {
    if (isStreaming) return;
    isStreaming = true;

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
                    agentMessage.innerHTML = formatContent(content);
                    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
                    break;

                case 'COMPLETE':
                    conversationId = msg.conversationId;
                    agentMessage.classList.remove('streaming');
                    isStreaming = false;
                    break;

                case 'ERROR':
                    agentMessage.classList.remove('streaming');
                    agentMessage.classList.add('error');
                    agentMessage.textContent = `Error: ${msg.error}`;
                    isStreaming = false;
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
// Event Handlers
// =============================================================================

// Tab switching
elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        elements.tabs.forEach(t => t.classList.remove('active'));
        elements.tabContents.forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        const targetId = `tab-${tab.dataset.tab}`;
        document.getElementById(targetId).classList.add('active');
    });
});

// Send message
elements.sendBtn.addEventListener('click', () => {
    const message = elements.messageInput.value.trim();
    if (message) {
        chat(message);
    }
});

elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const message = elements.messageInput.value.trim();
        if (message) {
            chat(message);
        }
    }
});

// Tool buttons
elements.toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const toolName = btn.dataset.tool;
        currentTool = toolName;

        // Get tool info
        chrome.runtime.sendMessage({ type: 'GET_FINANCIAL_TOOLS' }, (response) => {
            if (response.success && response.data[toolName]) {
                const tool = response.data[toolName];
                elements.modalTitle.textContent = tool.name;
                elements.modalDescription.textContent = tool.description;
                elements.modalParams.value = '{}';
                elements.modal.classList.add('active');
            }
        });
    });
});

// Modal
elements.modalClose.addEventListener('click', () => {
    elements.modal.classList.remove('active');
    currentTool = null;
});

elements.modalCancel.addEventListener('click', () => {
    elements.modal.classList.remove('active');
    currentTool = null;
});

elements.modalInvoke.addEventListener('click', async () => {
    if (!currentTool) return;

    let params = {};
    try {
        params = JSON.parse(elements.modalParams.value);
    } catch (e) {
        alert('Invalid JSON parameters');
        return;
    }

    setLoading(elements.modalInvoke, true);

    try {
        const result = await invokeTool(currentTool, params);
        elements.modal.classList.remove('active');

        // Show result in chat
        addMessage('agent', `**${currentTool} Result:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``);
    } catch (error) {
        alert(`Error: ${error.message}`);
    } finally {
        setLoading(elements.modalInvoke, false);
        currentTool = null;
    }
});

// Quick Actions - Predict LTV
elements.predictLtvBtn.addEventListener('click', async () => {
    const customerId = elements.ltvCustomerId.value.trim();
    if (!customerId) {
        showResult(elements.ltvResult, 'Please enter a Customer ID', true);
        return;
    }

    setLoading(elements.predictLtvBtn, true);

    try {
        const result = await sendMessage('PREDICT_LTV', {
            customerId,
            modelType: elements.ltvModelType.value
        });
        showResult(elements.ltvResult, `LTV: $${result.ltv_value?.toFixed(2) || 'N/A'}\nConfidence: ${(result.confidence * 100)?.toFixed(0) || 'N/A'}%\nModel: ${result.model_used || 'N/A'}`);
    } catch (error) {
        showResult(elements.ltvResult, error.message, true);
    } finally {
        setLoading(elements.predictLtvBtn, false);
    }
});

// Quick Actions - Optimize ROAS
elements.optimizeRoasBtn.addEventListener('click', async () => {
    const campaignId = elements.roasCampaignId.value.trim();
    if (!campaignId) {
        showResult(elements.roasResult, 'Please enter a Campaign ID', true);
        return;
    }

    setLoading(elements.optimizeRoasBtn, true);

    try {
        const result = await sendMessage('OPTIMIZE_ROAS', {
            campaignId,
            lookbackDays: parseInt(elements.roasLookback.value) || 14
        });
        showResult(elements.roasResult, `Recommended Target ROAS: ${result?.toFixed(2) || result}\nThis means ${(result * 100)?.toFixed(0)}% return per $1 spent`);
    } catch (error) {
        showResult(elements.roasResult, error.message, true);
    } finally {
        setLoading(elements.optimizeRoasBtn, false);
    }
});

// Quick Actions - Estimate CATE
elements.estimateCateBtn.addEventListener('click', async () => {
    const subjectId = elements.cateSubjectId.value.trim();
    if (!subjectId) {
        showResult(elements.cateResult, 'Please enter a Subject ID', true);
        return;
    }

    let features = {};
    if (elements.cateFeatures.value.trim()) {
        try {
            features = JSON.parse(elements.cateFeatures.value);
        } catch (e) {
            showResult(elements.cateResult, 'Invalid JSON features', true);
            return;
        }
    }

    setLoading(elements.estimateCateBtn, true);

    try {
        const result = await sendMessage('ESTIMATE_CATE', { subjectId, features });
        showResult(elements.cateResult, `CATE: ${result.cate?.toFixed(4) || 'N/A'}\n95% CI: [${result.interval?.[0]?.toFixed(3)}, ${result.interval?.[1]?.toFixed(3)}]\nVariance: ${result.variance?.toFixed(6) || 'N/A'}`);
    } catch (error) {
        showResult(elements.cateResult, error.message, true);
    } finally {
        setLoading(elements.estimateCateBtn, false);
    }
});

// Quick Actions - Compute Journey Risk
elements.computeRiskBtn.addEventListener('click', async () => {
    const userId = elements.riskUserId.value.trim();
    if (!userId) {
        showResult(elements.riskResult, 'Please enter a User ID', true);
        return;
    }

    setLoading(elements.computeRiskBtn, true);

    try {
        const result = await sendMessage('COMPUTE_JOURNEY_RISK', {
            userId,
            windowDays: parseInt(elements.riskWindow.value) || 14
        });
        showResult(elements.riskResult, `Risk Score: ${result.score?.toFixed(2) || 'N/A'}\nPolicy Action: ${result.policy_action || 'N/A'}\nConfidence: [${result.p95_lower?.toFixed(2)}, ${result.p95_upper?.toFixed(2)}]`);
    } catch (error) {
        showResult(elements.riskResult, error.message, true);
    } finally {
        setLoading(elements.computeRiskBtn, false);
    }
});

// Footer buttons
elements.openSidepanelBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        await chrome.sidePanel.open({ tabId: tab.id });
        window.close();
    }
});

elements.openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Check health on load
    await checkHealth();

    // Focus input
    elements.messageInput.focus();
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'CHAT_MESSAGE') {
        chat(request.message);
    }
});
