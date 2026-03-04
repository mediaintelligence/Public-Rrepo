/**
 * CRE Underwriting Engine - Background Service Worker
 * Handles context menus, notifications, and background tasks
 *
 * NOTE: This module exports functions to be called by the main background.js
 * It does NOT register its own chrome.runtime.onInstalled listener to avoid conflicts.
 */

// Extension state
const state = {
  isConnected: false,
  lastHealthCheck: null,
  apiUrl: 'https://boss-agent-adk-698171499447.us-central1.run.app',
};

/**
 * Initialize CRE extension components
 * Called by main background.js on install
 */
export async function initializeCRE(installReason) {
  console.log('CRE Underwriting Engine initializing:', installReason);

  // Create context menus (adds to existing, does not remove others)
  createCREContextMenus();

  // Set default settings on fresh install
  if (installReason === 'install') {
    await chrome.storage.local.set({
      apiUrl: state.apiUrl,
      enableNotifications: true,
      defaultPropertyType: 'office',
      defaultSimulationPaths: 1000,
      recentRuns: [],
    });
  }

  // Check API connection
  await checkAPIHealth();
}

/**
 * Create CRE-specific context menus
 * Does NOT call removeAll() to preserve menus from other modules
 */
function createCREContextMenus() {
  // Quick validate selection (for text containing lease data)
  chrome.contextMenus.create({
    id: 'cre-quick-validate',
    title: 'CRE: Quick Validate Selection',
    contexts: ['selection'],
  });

  // Open side panel
  chrome.contextMenus.create({
    id: 'cre-open-panel',
    title: 'CRE: Open Analysis Panel',
    contexts: ['page', 'action'],
  });

  // Run market simulation
  chrome.contextMenus.create({
    id: 'cre-market-sim',
    title: 'CRE: Run Market Simulation',
    contexts: ['page', 'action'],
  });

  // Separator
  chrome.contextMenus.create({
    id: 'cre-separator',
    type: 'separator',
    contexts: ['action'],
  });

  // Settings
  chrome.contextMenus.create({
    id: 'cre-settings',
    title: 'CRE: Settings',
    contexts: ['action'],
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'cre-quick-validate':
      await handleQuickValidate(info.selectionText, tab);
      break;

    case 'cre-open-panel':
      await openSidePanel(tab);
      break;

    case 'cre-market-sim':
      await runQuickMarketSim(tab);
      break;

    case 'cre-settings':
      chrome.runtime.openOptionsPage();
      break;
  }
});

// Handle quick validation of selected text
async function handleQuickValidate(text, tab) {
  if (!text) {
    showNotification('No Selection', 'Please select text containing lease data.');
    return;
  }

  try {
    // Try to parse lease data from text
    const leaseData = parseLeaseDataFromText(text);

    if (!leaseData) {
      showNotification('Parse Error', 'Could not parse lease data from selection.');
      return;
    }

    // Validate via API
    const result = await validateLease(leaseData);

    // Show result notification
    if (result.is_valid) {
      showNotification('Validation Passed', `Lease validated successfully. ${result.checks_passed?.length || 0} checks passed.`);
    } else {
      const blockers = result.blockers?.length || 0;
      const warnings = result.warnings?.length || 0;
      showNotification('Validation Issues', `Found ${blockers} blockers and ${warnings} warnings.`);
    }

    // Send result to content script
    chrome.tabs.sendMessage(tab.id, {
      type: 'CRE_VALIDATION_RESULT',
      data: result,
    });

  } catch (error) {
    console.error('Validation error:', error);
    showNotification('Error', 'Failed to validate lease data.');
  }
}

// Parse lease data from text (simple implementation)
function parseLeaseDataFromText(text) {
  const data = {};

  // Try to extract RSF
  const rsfMatch = text.match(/(\d{1,3}(?:,\d{3})*)\s*(?:rsf|sf|sqft|square feet)/i);
  if (rsfMatch) {
    data.rsf = parseInt(rsfMatch[1].replace(/,/g, ''));
  }

  // Try to extract rent
  const rentMatch = text.match(/\$?(\d+(?:\.\d{2})?)\s*(?:\/sf|per sf|psf)/i);
  if (rentMatch) {
    data.base_rent = parseFloat(rentMatch[1]);
  }

  // Try to extract lease type
  if (/triple net|nnn/i.test(text)) data.lease_type = 'triple_net';
  else if (/modified gross|mg/i.test(text)) data.lease_type = 'modified_gross';
  else if (/gross/i.test(text)) data.lease_type = 'gross';

  // Try to extract dates
  const datePattern = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/g;
  const dates = text.match(datePattern);
  if (dates && dates.length >= 2) {
    data.commencement_date = dates[0];
    data.expiration_date = dates[1];
  }

  // Return null if we couldn't extract meaningful data
  if (Object.keys(data).length < 2) return null;

  return data;
}

// Validate lease via API
async function validateLease(leaseData) {
  const settings = await chrome.storage.local.get(['apiUrl', 'apiToken']);
  const baseUrl = settings.apiUrl || state.apiUrl;

  const response = await fetch(`${baseUrl}/api/v1/cre-underwriting/validate-lease`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiToken && { 'Authorization': `Bearer ${settings.apiToken}` }),
    },
    body: JSON.stringify({
      lease_data: leaseData,
      validate_all: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return await response.json();
}

// Open side panel
async function openSidePanel(tab) {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error('Error opening side panel:', error);
    // Fallback: open popup
    chrome.action.openPopup();
  }
}

// Run quick market simulation
async function runQuickMarketSim(tab) {
  const settings = await chrome.storage.local.get(['defaultPropertyType', 'defaultSimulationPaths']);

  try {
    const result = await simulateMarket({
      property_type: settings.defaultPropertyType || 'office',
      num_paths: settings.defaultSimulationPaths || 1000,
      horizon_years: 10,
    });

    showNotification(
      'Market Simulation Complete',
      `Cap Rate: ${(result.cap_rate?.mean * 100).toFixed(2)}%, Vacancy: ${(result.vacancy?.mean * 100).toFixed(1)}%`
    );

    // Send result to content script
    chrome.tabs.sendMessage(tab.id, {
      type: 'CRE_MARKET_RESULT',
      data: result,
    });

  } catch (error) {
    console.error('Simulation error:', error);
    showNotification('Error', 'Failed to run market simulation.');
  }
}

// Simulate market via API
async function simulateMarket(params) {
  const settings = await chrome.storage.local.get(['apiUrl', 'apiToken']);
  const baseUrl = settings.apiUrl || state.apiUrl;

  const response = await fetch(`${baseUrl}/api/v1/cre-underwriting/simulate-market`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiToken && { 'Authorization': `Bearer ${settings.apiToken}` }),
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return await response.json();
}

// Check API health
async function checkAPIHealth() {
  const settings = await chrome.storage.local.get(['apiUrl']);
  const baseUrl = settings.apiUrl || state.apiUrl;

  try {
    const response = await fetch(`${baseUrl}/api/v1/cre-underwriting/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    state.isConnected = response.ok;
    state.lastHealthCheck = new Date().toISOString();

    if (response.ok) {
      const data = await response.json();
      chrome.storage.local.set({ lastStatus: data });
    }
  } catch (error) {
    console.error('Health check failed:', error);
    state.isConnected = false;
  }

  // Update badge
  updateBadge();
}

// Update extension badge
function updateBadge() {
  if (state.isConnected) {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setBadgeBackgroundColor({ color: '#38a169' });
  } else {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#e53e3e' });
  }
}

// Show notification
function showNotification(title, message) {
  chrome.storage.local.get(['enableNotifications'], (settings) => {
    if (settings.enableNotifications !== false) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '../icons/icon48.png',
        title: `CRE Engine: ${title}`,
        message: message,
      });
    }
  });
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_STATUS':
      sendResponse({
        isConnected: state.isConnected,
        lastHealthCheck: state.lastHealthCheck,
      });
      break;

    case 'CHECK_HEALTH':
      checkAPIHealth().then(() => {
        sendResponse({ isConnected: state.isConnected });
      });
      return true; // Async response

    case 'RUN_VALIDATION':
      validateLease(message.data).then(result => {
        sendResponse({ success: true, data: result });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case 'RUN_SIMULATION':
      simulateMarket(message.data).then(result => {
        sendResponse({ success: true, data: result });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;

    case 'SAVE_RUN':
      saveRun(message.data).then(() => {
        sendResponse({ success: true });
      });
      return true;
  }
});

// Save run to history
async function saveRun(runData) {
  const settings = await chrome.storage.local.get(['recentRuns']);
  const runs = settings.recentRuns || [];

  // Add new run at the beginning
  runs.unshift({
    ...runData,
    timestamp: new Date().toISOString(),
  });

  // Keep only last 50 runs
  const recentRuns = runs.slice(0, 50);

  await chrome.storage.local.set({ recentRuns });
}

// Handle keyboard commands
chrome.commands.onCommand.addListener(async (command, tab) => {
  switch (command) {
    case 'open_side_panel':
      await openSidePanel(tab);
      break;

    case 'quick_validate':
      // Get selected text and validate
      chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' }, async (response) => {
        if (response && response.text) {
          await handleQuickValidate(response.text, tab);
        }
      });
      break;
  }
});

// Periodic health check alarm listener (alarm created in initializeCRE)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cre-healthCheck') {
    checkAPIHealth();
  }
});

/**
 * Setup CRE alarms - called after initialization
 */
export function setupCREAlarms() {
  // Periodic health check (every 5 minutes)
  chrome.alarms.create('cre-healthCheck', { periodInMinutes: 5 });
  // Initial health check
  checkAPIHealth();
  console.log('CRE Underwriting Engine alarms initialized');
}

console.log('CRE Underwriting Engine module loaded');
