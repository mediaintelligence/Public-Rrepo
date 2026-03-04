/**
 * Boss Agent Chrome Extension - Background Service Worker
 *
 * Handles:
 * - API communication with Boss Agent
 * - Context menu actions
 * - Message passing between popup/sidepanel/content scripts
 * - Financial model tool invocations
 */

// =============================================================================
// Configuration
// =============================================================================

// Import CRE Underwriting Logic (exported functions, no auto-listeners)
import { initializeCRE, setupCREAlarms } from './cre_background/service-worker.js';

const DEFAULT_CONFIG = {
    bossAgentUrl: 'https://boss-agent-adk-698171499447.us-central1.run.app',
    timeout: 90000,
    maxRetries: 3
};

let config = { ...DEFAULT_CONFIG };

// Load config from storage
chrome.storage.sync.get(['bossAgentUrl', 'apiUrl', 'authToken', 'apiKey', 'timeout', 'maxRetries'], (result) => {
    if (result.bossAgentUrl || result.apiUrl) config.bossAgentUrl = result.bossAgentUrl || result.apiUrl;
    if (result.timeout) config.timeout = result.timeout;
    if (result.maxRetries) config.maxRetries = result.maxRetries;
});

// =============================================================================
// Financial Models - MCP Tools Registry
// =============================================================================

const FINANCIAL_TOOLS = {
    // Value-Based Bidding
    'vbb_process_conversion': {
        name: 'Process Conversion (VBB)',
        description: 'Process conversion with value rules and LTV adjustment',
        category: 'Value-Based Bidding'
    },
    'vbb_predict_ltv': {
        name: 'Predict LTV',
        description: 'Predict customer lifetime value using historical, cohort, or ML models',
        category: 'Value-Based Bidding'
    },
    'vbb_optimize_target_roas': {
        name: 'Optimize Target ROAS',
        description: 'Get recommended Target ROAS based on campaign performance',
        category: 'Value-Based Bidding'
    },
    'vbb_add_value_rule': {
        name: 'Add Value Rule',
        description: 'Add conversion value rule for device/audience/location',
        category: 'Value-Based Bidding'
    },

    // Attribution
    'attribution_stitch_id': {
        name: 'Stitch Cross-Platform ID',
        description: 'Link platform IDs to unified CrossPlatformID',
        category: 'Attribution'
    },
    'attribution_recompute': {
        name: 'Recompute Attribution',
        description: 'Run nightly attribution recomputation',
        category: 'Attribution'
    },
    'attribution_push_weights': {
        name: 'Push Attribution Weights',
        description: 'Back-propagate weights to Meta/Google platforms',
        category: 'Attribution'
    },

    // ROI & CATE
    'roi_estimate_cate': {
        name: 'Estimate CATE',
        description: 'Compute CATE (Conditional Average Treatment Effect) with confidence intervals',
        category: 'ROI Optimization'
    },
    'roi_validate_policy': {
        name: 'Validate ROI Policy',
        description: 'Validate policy using OPE (IPS, DR, SNIPS)',
        category: 'ROI Optimization'
    },
    'roi_optimize': {
        name: 'Optimize ROI',
        description: 'Run guardrailed ROI optimization',
        category: 'ROI Optimization'
    },
    'decision_score': {
        name: 'Decision Score',
        description: 'Score decision with CATE and uncertainty',
        category: 'ROI Optimization'
    },
    'decision_allocate': {
        name: 'Budget Allocation',
        description: 'Optimal budget allocation across channels',
        category: 'ROI Optimization'
    },

    // Uplift Modeling
    'uplift_export_cohort': {
        name: 'Export Uplift Cohort',
        description: 'Export top-K uplift users with guardrails and iROAS/iCPA',
        category: 'Uplift Modeling'
    },
    'uplift_activate_cohort': {
        name: 'Activate Cohort',
        description: 'Activate cohort on Google Ads, Meta, or email',
        category: 'Uplift Modeling'
    },
    'journey_compute_risk': {
        name: 'Compute Journey Risk',
        description: 'Compute journey uplift risk score for a user',
        category: 'Uplift Modeling'
    },
    'journey_trigger_intervention': {
        name: 'Trigger Intervention',
        description: 'Compute score and trigger appropriate intervention',
        category: 'Uplift Modeling'
    },

    // Pacing & Creative
    'uplift_pacing_run': {
        name: 'Run Uplift Pacing',
        description: 'Execute pacing with uplift-based adjustment',
        category: 'Pacing'
    },
    'uplift_estimate': {
        name: 'Estimate Uplift',
        description: 'Estimate causal uplift using CUPED, Geo Holdout, or Switchback',
        category: 'Pacing'
    },
    'creative_fatigue_assess': {
        name: 'Assess Creative Fatigue',
        description: 'Assess fatigue level for a creative',
        category: 'Creative'
    },
    'creative_fatigue_rotate': {
        name: 'Rotate Creative',
        description: 'Assess and optionally rotate fatigued creative',
        category: 'Creative'
    }
};

function deriveToolCategory(toolName) {
    if (typeof toolName !== 'string') {
        return 'Other';
    }
    const idx = toolName.indexOf('_');
    if (idx <= 0) {
        return 'Other';
    }
    return toolName.slice(0, idx).toUpperCase();
}

function normalizeToolsResponse(rawTools) {
    const normalized = {};
    if (!rawTools) {
        return normalized;
    }

    const toolsArray = Array.isArray(rawTools)
        ? rawTools
        : (Array.isArray(rawTools.tools) ? rawTools.tools : null);

    if (toolsArray) {
        for (const tool of toolsArray) {
            if (!tool || typeof tool.name !== 'string') {
                continue;
            }
            normalized[tool.name] = {
                name: tool.name,
                description: typeof tool.description === 'string' ? tool.description : '',
                category: tool.category || deriveToolCategory(tool.name),
                parameters: tool.parameters || {}
            };
        }
        return normalized;
    }

    if (typeof rawTools === 'object') {
        for (const [key, value] of Object.entries(rawTools)) {
            if (key === 'count') {
                continue;
            }
            if (Array.isArray(value)) {
                continue;
            }

            if (value && typeof value === 'object') {
                const name = typeof value.name === 'string' ? value.name : key;
                normalized[name] = {
                    name,
                    description: typeof value.description === 'string' ? value.description : '',
                    category: value.category || deriveToolCategory(name),
                    parameters: value.parameters || {}
                };
            }
        }
    }

    return normalized;
}

// =============================================================================
// API Client
// =============================================================================

class BossAgentAPI {
    constructor() {
        this.conversationId = null;
    }

    async getAuthToken() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['authToken', 'apiKey'], (result) => {
                resolve(result.authToken || result.apiKey || null);
            });
        });
    }

    async request(endpoint, options = {}) {
        const authToken = await this.getAuthToken();

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        try {
            const response = await fetch(`${config.bossAgentUrl}${endpoint}`, {
                ...options,
                headers,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            throw error;
        }
    }

    async checkHealth() {
        return this.request('/health');
    }

    async chat(message, conversationId = null) {
        const response = await this.request('/api/v1/chat', {
            method: 'POST',
                body: JSON.stringify({
                    message,
                    conversation_id: conversationId || this.conversationId,
                    orchestration_mode: 'direct',
                    stream: false
                })
        });

        this.conversationId = response.conversation_id || response.conversationId || this.conversationId;
        return response;
    }

    async streamChat(message, conversationId, onToken, onComplete, onError) {
        const authToken = await this.getAuthToken();

        const headers = {
            'Content-Type': 'application/json'
        };

        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        try {
            const response = await fetch(`${config.bossAgentUrl}/api/v1/chat/stream`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    message,
                    conversation_id: conversationId || this.conversationId,
                    orchestration_mode: 'direct',
                    stream: true
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            onComplete(this.conversationId);
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.type === 'token' && parsed.content) {
                                onToken(parsed.content);
                            }
                            if (parsed.type === 'done') {
                                const doneConversationId = parsed.conversationId || parsed.conversation_id || this.conversationId;
                                this.conversationId = doneConversationId;
                                onComplete(doneConversationId);
                                return;
                            }
                            if (parsed.conversation_id || parsed.conversationId) {
                                this.conversationId = parsed.conversation_id || parsed.conversationId;
                            }
                        } catch (e) {
                            // Non-JSON data, treat as token
                            onToken(data);
                        }
                    }
                }
            }

            onComplete(this.conversationId);
        } catch (error) {
            onError(error);
        }
    }

    async invokeTool(toolName, params = {}) {
        try {
            return await this.request(`/api/v1/mcp/tools/${encodeURIComponent(toolName)}/invoke`, {
                method: 'POST',
                body: JSON.stringify(params)
            });
        } catch (error) {
            if (error?.message?.includes('HTTP 404')) {
                return this.request('/api/v1/mcp/invoke', {
                    method: 'POST',
                    body: JSON.stringify({ tool: toolName, params })
                });
            }
            throw error;
        }
    }

    async getTools() {
        try {
            const rawTools = await this.request('/api/v1/mcp/tools');
            const normalized = normalizeToolsResponse(rawTools);
            if (Object.keys(normalized).length > 0) {
                return normalized;
            }
        } catch (error) {
            console.warn('Falling back to bundled financial tools:', error?.message || error);
        }
        return { ...FINANCIAL_TOOLS };
    }

    async getCellsStatus() {
        return this.request('/api/v1/cells/health/all');
    }

    // Financial model shortcuts
    async predictLTV(customerId, modelType = 'historical') {
        return this.invokeTool('vbb_predict_ltv', {
            customer_id: customerId,
            model_type: modelType
        });
    }

    async optimizeTargetROAS(campaignId, lookbackDays = 14) {
        return this.invokeTool('vbb_optimize_target_roas', {
            campaign_id: campaignId,
            lookback_days: lookbackDays
        });
    }

    async estimateCate(subjectId, features = {}) {
        return this.invokeTool('roi_estimate_cate', {
            subject_id: subjectId,
            features
        });
    }

    async exportUpliftCohort(modelId, kPercent = 0.1) {
        return this.invokeTool('uplift_export_cohort', {
            model_id: modelId,
            k_percent: kPercent
        });
    }

    async computeJourneyRisk(userId, windowDays = 14) {
        return this.invokeTool('journey_compute_risk', {
            user_id: userId,
            window_days: windowDays
        });
    }
}

const api = new BossAgentAPI();

// =============================================================================
// Context Menu Setup
// =============================================================================

chrome.runtime.onInstalled.addListener(async (details) => {
    // Main context menu
    chrome.contextMenus.create({
        id: 'boss-agent-main',
        title: 'Boss Agent',
        contexts: ['selection', 'page']
    });

    // Ask about selection
    chrome.contextMenus.create({
        id: 'boss-agent-ask',
        parentId: 'boss-agent-main',
        title: 'Ask about "%s"',
        contexts: ['selection']
    });

    // Financial tools submenu
    chrome.contextMenus.create({
        id: 'boss-agent-financial',
        parentId: 'boss-agent-main',
        title: 'Financial Tools',
        contexts: ['selection', 'page']
    });

    chrome.contextMenus.create({
        id: 'boss-agent-predict-ltv',
        parentId: 'boss-agent-financial',
        title: 'Predict LTV for "%s"',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'boss-agent-estimate-cate',
        parentId: 'boss-agent-financial',
        title: 'Estimate CATE for "%s"',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'boss-agent-journey-risk',
        parentId: 'boss-agent-financial',
        title: 'Compute Journey Risk for "%s"',
        contexts: ['selection']
    });

    // Open side panel
    chrome.contextMenus.create({
        id: 'boss-agent-sidepanel',
        parentId: 'boss-agent-main',
        title: 'Open Side Panel',
        contexts: ['page']
    });

    // Initialize CRE Underwriting module (creates its own context menus)
    await initializeCRE(details.reason);
    setupCREAlarms();
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const selectedText = info.selectionText || '';

    switch (info.menuItemId) {
        case 'boss-agent-ask':
            // Open side panel and send message
            await chrome.sidePanel.open({ tabId: tab.id });
            setTimeout(() => {
                chrome.runtime.sendMessage({
                    type: 'CHAT_MESSAGE',
                    message: `Tell me about: ${selectedText}`
                });
            }, 500);
            break;

        case 'boss-agent-predict-ltv':
            try {
                const result = await api.predictLTV(selectedText);
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'LTV Prediction',
                    message: `Predicted LTV: $${result.ltv_value?.toFixed(2) || 'N/A'}`
                });
            } catch (error) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'Error',
                    message: error.message
                });
            }
            break;

        case 'boss-agent-estimate-cate':
            try {
                const result = await api.estimateCate(selectedText);
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'CATE Estimation',
                    message: `CATE: ${result.cate?.toFixed(4) || 'N/A'} [${result.interval?.[0]?.toFixed(3)}, ${result.interval?.[1]?.toFixed(3)}]`
                });
            } catch (error) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'Error',
                    message: error.message
                });
            }
            break;

        case 'boss-agent-journey-risk':
            try {
                const result = await api.computeJourneyRisk(selectedText);
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'Journey Risk',
                    message: `Risk Score: ${result.score?.toFixed(2) || 'N/A'} - Action: ${result.policy_action || 'N/A'}`
                });
            } catch (error) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'Error',
                    message: error.message
                });
            }
            break;

        case 'boss-agent-sidepanel':
            await chrome.sidePanel.open({ tabId: tab.id });
            break;
    }
});

// =============================================================================
// Message Handling
// =============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle async responses
    (async () => {
        try {
            switch (request.type) {
                case 'SETTINGS_UPDATED':
                    if (request.settings?.apiUrl || request.settings?.bossAgentUrl) {
                        config.bossAgentUrl = request.settings.apiUrl || request.settings.bossAgentUrl;
                    }
                    if (request.settings?.timeout) {
                        config.timeout = request.settings.timeout;
                    }
                    if (request.settings?.maxRetries) {
                        config.maxRetries = request.settings.maxRetries;
                    }
                    sendResponse({ success: true, data: { updated: true } });
                    break;

                case 'CHECK_HEALTH':
                    const health = await api.checkHealth();
                    sendResponse({ success: true, data: health });
                    break;

                case 'CHAT':
                    const chatResponse = await api.chat(request.message, request.conversationId);
                    sendResponse({ success: true, data: chatResponse });
                    break;

                case 'STREAM_CHAT':
                    // Streaming handled separately via ports
                    sendResponse({ success: true, message: 'Use port for streaming' });
                    break;

                case 'INVOKE_TOOL':
                    const toolResult = await api.invokeTool(request.tool, request.params);
                    sendResponse({ success: true, data: toolResult });
                    break;

                case 'GET_TOOLS':
                    const tools = await api.getTools();
                    sendResponse({ success: true, data: tools });
                    break;

                case 'GET_FINANCIAL_TOOLS':
                    sendResponse({ success: true, data: FINANCIAL_TOOLS });
                    break;

                case 'GET_CELLS_STATUS':
                    const cells = await api.getCellsStatus();
                    sendResponse({ success: true, data: cells });
                    break;

                case 'PREDICT_LTV':
                    const ltv = await api.predictLTV(request.customerId, request.modelType);
                    sendResponse({ success: true, data: ltv });
                    break;

                case 'OPTIMIZE_ROAS':
                    const roas = await api.optimizeTargetROAS(request.campaignId, request.lookbackDays);
                    sendResponse({ success: true, data: roas });
                    break;

                case 'ESTIMATE_CATE':
                    const cate = await api.estimateCate(request.subjectId, request.features);
                    sendResponse({ success: true, data: cate });
                    break;

                case 'EXPORT_UPLIFT_COHORT':
                    const cohort = await api.exportUpliftCohort(request.modelId, request.kPercent);
                    sendResponse({ success: true, data: cohort });
                    break;

                case 'COMPUTE_JOURNEY_RISK':
                    const risk = await api.computeJourneyRisk(request.userId, request.windowDays);
                    sendResponse({ success: true, data: risk });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    })();

    // Return true to indicate async response
    return true;
});

// Handle streaming via ports
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'stream-chat') {
        port.onMessage.addListener(async (msg) => {
            if (msg.type === 'START_STREAM') {
                await api.streamChat(
                    msg.message,
                    msg.conversationId,
                    (token) => port.postMessage({ type: 'TOKEN', token }),
                    (convId) => port.postMessage({ type: 'COMPLETE', conversationId: convId }),
                    (error) => port.postMessage({ type: 'ERROR', error: error.message })
                );
            }
        });
    }
});

// =============================================================================
// Commands
// =============================================================================

chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'open_sidepanel') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            await chrome.sidePanel.open({ tabId: tab.id });
        }
    }
});

// =============================================================================
// Initialization
// =============================================================================

console.log('Boss Agent background service worker initialized');
