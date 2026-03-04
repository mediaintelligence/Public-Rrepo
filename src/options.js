/**
 * Boss Agent Chrome Extension - Options Page JavaScript
 */

// =============================================================================
// DOM Elements
// =============================================================================

const elements = {
    // Connection
    apiUrl: document.getElementById('api-url'),
    apiKey: document.getElementById('api-key'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    testConnectionBtn: document.getElementById('test-connection'),

    // Preferences
    enableNotifications: document.getElementById('enable-notifications'),
    enableContextMenu: document.getElementById('enable-context-menu'),
    autoOpenSidepanel: document.getElementById('auto-open-sidepanel'),
    defaultModel: document.getElementById('default-model'),

    // Financial Tools
    enableQuickTools: document.getElementById('enable-quick-tools'),
    defaultLookback: document.getElementById('default-lookback'),
    defaultLtvModel: document.getElementById('default-ltv-model'),

    // Actions
    saveSettingsBtn: document.getElementById('save-settings'),
    resetSettingsBtn: document.getElementById('reset-settings'),

    // Toast
    toast: document.getElementById('toast')
};

// =============================================================================
// Default Settings
// =============================================================================

const DEFAULT_SETTINGS = {
    apiUrl: 'https://boss-agent-adk-698171499447.us-central1.run.app',
    apiKey: '',
    enableNotifications: true,
    enableContextMenu: true,
    autoOpenSidepanel: false,
    defaultModel: 'auto',
    enableQuickTools: true,
    defaultLookback: '14',
    defaultLtvModel: 'hybrid'
};

// =============================================================================
// Utility Functions
// =============================================================================

function showToast(message, isError = false) {
    elements.toast.textContent = message;
    elements.toast.className = `toast visible${isError ? ' error' : ''}`;

    setTimeout(() => {
        elements.toast.className = 'toast';
    }, 3000);
}

function setConnectionStatus(status) {
    elements.statusDot.className = `status-dot ${status}`;

    switch (status) {
        case 'connected':
            elements.statusText.textContent = 'Connected to Boss Agent';
            break;
        case 'error':
            elements.statusText.textContent = 'Connection failed';
            break;
        default:
            elements.statusText.textContent = 'Checking connection...';
    }
}

// =============================================================================
// Settings Management
// =============================================================================

async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);

        elements.apiUrl.value = result.apiUrl;
        elements.apiKey.value = result.apiKey;
        elements.enableNotifications.checked = result.enableNotifications;
        elements.enableContextMenu.checked = result.enableContextMenu;
        elements.autoOpenSidepanel.checked = result.autoOpenSidepanel;
        elements.defaultModel.value = result.defaultModel;
        elements.enableQuickTools.checked = result.enableQuickTools;
        elements.defaultLookback.value = result.defaultLookback;
        elements.defaultLtvModel.value = result.defaultLtvModel;

        // Test connection with loaded settings
        await testConnection();
    } catch (error) {
        console.error('Failed to load settings:', error);
        showToast('Failed to load settings', true);
    }
}

async function saveSettings() {
    const settings = {
        apiUrl: elements.apiUrl.value.trim() || DEFAULT_SETTINGS.apiUrl,
        apiKey: elements.apiKey.value.trim(),
        enableNotifications: elements.enableNotifications.checked,
        enableContextMenu: elements.enableContextMenu.checked,
        autoOpenSidepanel: elements.autoOpenSidepanel.checked,
        defaultModel: elements.defaultModel.value,
        enableQuickTools: elements.enableQuickTools.checked,
        defaultLookback: elements.defaultLookback.value,
        defaultLtvModel: elements.defaultLtvModel.value
    };

    try {
        await chrome.storage.sync.set(settings);

        // Notify background script of settings change
        chrome.runtime.sendMessage({
            type: 'SETTINGS_UPDATED',
            settings
        });

        showToast('Settings saved successfully');

        // Test connection with new settings
        await testConnection();
    } catch (error) {
        console.error('Failed to save settings:', error);
        showToast('Failed to save settings', true);
    }
}

async function resetSettings() {
    if (!confirm('Are you sure you want to reset all settings to defaults?')) {
        return;
    }

    try {
        await chrome.storage.sync.set(DEFAULT_SETTINGS);
        await loadSettings();
        showToast('Settings reset to defaults');
    } catch (error) {
        console.error('Failed to reset settings:', error);
        showToast('Failed to reset settings', true);
    }
}

// =============================================================================
// Connection Test
// =============================================================================

async function testConnection() {
    setConnectionStatus('');
    elements.testConnectionBtn.disabled = true;
    elements.testConnectionBtn.textContent = 'Testing...';

    const apiUrl = elements.apiUrl.value.trim() || DEFAULT_SETTINGS.apiUrl;
    const apiKey = elements.apiKey.value.trim();

    try {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(`${apiUrl}/health`, {
            method: 'GET',
            headers
        });

        if (response.ok) {
            const data = await response.json();
            setConnectionStatus('connected');
            elements.statusText.textContent = `Connected - v${data.version || '?'}`;
        } else {
            setConnectionStatus('error');
            elements.statusText.textContent = `Error: ${response.status} ${response.statusText}`;
        }
    } catch (error) {
        setConnectionStatus('error');
        elements.statusText.textContent = `Error: ${error.message}`;
    } finally {
        elements.testConnectionBtn.disabled = false;
        elements.testConnectionBtn.textContent = 'Test Connection';
    }
}

// =============================================================================
// Event Handlers
// =============================================================================

elements.testConnectionBtn.addEventListener('click', testConnection);
elements.saveSettingsBtn.addEventListener('click', saveSettings);
elements.resetSettingsBtn.addEventListener('click', resetSettings);

// Auto-test on URL change
elements.apiUrl.addEventListener('change', testConnection);
elements.apiKey.addEventListener('change', testConnection);

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', loadSettings);
