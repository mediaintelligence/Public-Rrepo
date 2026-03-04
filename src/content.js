/**
 * Boss Agent Chrome Extension - Content Script
 * Injected into web pages to provide Boss Agent functionality
 */

// =============================================================================
// Selection Handling
// =============================================================================

/**
 * Get selected text on the page
 */
function getSelectedText() {
    const selection = window.getSelection();
    return selection ? selection.toString().trim() : '';
}

/**
 * Listen for selection changes and store selected text
 */
document.addEventListener('mouseup', () => {
    const selectedText = getSelectedText();
    if (selectedText) {
        chrome.storage.local.set({ lastSelectedText: selectedText });
    }
});

// =============================================================================
// Message Handling
// =============================================================================

/**
 * Listen for messages from background script or popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
        case 'GET_SELECTION':
            sendResponse({ text: getSelectedText() });
            break;

        case 'GET_PAGE_INFO':
            sendResponse({
                url: window.location.href,
                title: document.title,
                selection: getSelectedText()
            });
            break;

        case 'INJECT_RESULT':
            showResultOverlay(request.result);
            sendResponse({ success: true });
            break;

        case 'HIGHLIGHT_METRICS':
            highlightFinancialMetrics();
            sendResponse({ success: true });
            break;

        default:
            sendResponse({ error: 'Unknown message type' });
    }

    return true; // Keep message channel open for async response
});

// =============================================================================
// Financial Metrics Detection
// =============================================================================

const METRIC_PATTERNS = {
    currency: /\$[\d,]+(?:\.\d{2})?/g,
    percentage: /\d+(?:\.\d+)?%/g,
    roas: /\bROAS[:\s]+[\d.]+/gi,
    cpa: /\bCPA[:\s]+\$?[\d,]+(?:\.\d{2})?/gi,
    ctr: /\bCTR[:\s]+[\d.]+%?/gi,
    cvr: /\bCVR[:\s]+[\d.]+%?/gi,
    ltv: /\bLTV[:\s]+\$?[\d,]+(?:\.\d{2})?/gi,
    cate: /\bCATE[:\s]+[\d.]+/gi
};

/**
 * Find and highlight financial metrics on the page
 */
function highlightFinancialMetrics() {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        if (node.nodeValue && node.nodeValue.trim()) {
            textNodes.push(node);
        }
    }

    let highlightCount = 0;

    textNodes.forEach(textNode => {
        let text = textNode.nodeValue;
        let hasMatch = false;

        // Check each pattern
        for (const [type, pattern] of Object.entries(METRIC_PATTERNS)) {
            if (pattern.test(text)) {
                hasMatch = true;
                break;
            }
        }

        if (hasMatch && textNode.parentElement) {
            // Wrap in highlight span
            const span = document.createElement('span');
            span.className = 'boss-agent-metric-highlight';
            span.textContent = text;
            span.setAttribute('data-boss-agent', 'metric');

            if (textNode.parentElement && textNode.parentElement.parentElement) {
                try {
                    textNode.parentElement.replaceChild(span, textNode);
                    highlightCount++;
                } catch (e) {
                    // Skip if we can't replace
                }
            }
        }
    });

    // Inject styles if not already present
    if (!document.getElementById('boss-agent-highlight-styles')) {
        const style = document.createElement('style');
        style.id = 'boss-agent-highlight-styles';
        style.textContent = `
            .boss-agent-metric-highlight {
                background: rgba(233, 69, 96, 0.2);
                border-bottom: 2px solid #e94560;
                padding: 0 2px;
                cursor: pointer;
                transition: background 0.2s;
            }
            .boss-agent-metric-highlight:hover {
                background: rgba(233, 69, 96, 0.4);
            }
        `;
        document.head.appendChild(style);
    }

    // Show notification
    if (highlightCount > 0) {
        showNotification(`Highlighted ${highlightCount} financial metrics`);
    } else {
        showNotification('No financial metrics found on this page');
    }
}

// =============================================================================
// Result Overlay
// =============================================================================

/**
 * Show a result overlay on the page
 */
function showResultOverlay(result) {
    // Remove existing overlay
    const existing = document.getElementById('boss-agent-overlay');
    if (existing) {
        existing.remove();
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'boss-agent-overlay';
    overlay.innerHTML = `
        <style>
            #boss-agent-overlay {
                position: fixed;
                top: 20px;
                right: 20px;
                max-width: 400px;
                background: #1a1a2e;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                z-index: 2147483647;
                font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                color: #f0f0f0;
                animation: boss-agent-slide-in 0.3s ease;
            }
            @keyframes boss-agent-slide-in {
                from {
                    opacity: 0;
                    transform: translateX(20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            #boss-agent-overlay-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
            #boss-agent-overlay-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                font-size: 14px;
            }
            #boss-agent-overlay-close {
                background: none;
                border: none;
                color: #9090a0;
                cursor: pointer;
                font-size: 20px;
                line-height: 1;
                padding: 4px;
            }
            #boss-agent-overlay-close:hover {
                color: #f0f0f0;
            }
            #boss-agent-overlay-content {
                padding: 16px;
                font-size: 14px;
                line-height: 1.5;
                max-height: 400px;
                overflow-y: auto;
            }
            #boss-agent-overlay-content pre {
                background: rgba(0, 0, 0, 0.3);
                padding: 12px;
                border-radius: 8px;
                overflow-x: auto;
                font-size: 12px;
                margin: 8px 0;
            }
            #boss-agent-overlay-content code {
                font-family: 'JetBrains Mono', 'Consolas', monospace;
            }
        </style>
        <div id="boss-agent-overlay-header">
            <div id="boss-agent-overlay-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e94560" stroke-width="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                </svg>
                Boss Agent Result
            </div>
            <button id="boss-agent-overlay-close">&times;</button>
        </div>
        <div id="boss-agent-overlay-content">
            ${formatResult(result)}
        </div>
    `;

    document.body.appendChild(overlay);

    // Close button handler
    overlay.querySelector('#boss-agent-overlay-close').addEventListener('click', () => {
        overlay.remove();
    });

    // Auto-close after 30 seconds
    setTimeout(() => {
        if (document.getElementById('boss-agent-overlay')) {
            overlay.remove();
        }
    }, 30000);
}

/**
 * Format result for display
 */
function formatResult(result) {
    if (typeof result === 'string') {
        return escapeHtml(result).replace(/\n/g, '<br>');
    }

    if (typeof result === 'object') {
        return `<pre><code>${escapeHtml(JSON.stringify(result, null, 2))}</code></pre>`;
    }

    return String(result);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================================================
// Notification
// =============================================================================

/**
 * Show a small notification
 */
function showNotification(message) {
    const existing = document.getElementById('boss-agent-notification');
    if (existing) {
        existing.remove();
    }

    const notification = document.createElement('div');
    notification.id = 'boss-agent-notification';
    notification.innerHTML = `
        <style>
            #boss-agent-notification {
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 12px 20px;
                background: #1a1a2e;
                border: 1px solid #e94560;
                border-radius: 8px;
                color: #f0f0f0;
                font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                font-size: 14px;
                z-index: 2147483647;
                animation: boss-agent-fade-in 0.3s ease;
            }
            @keyframes boss-agent-fade-in {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        </style>
        ${escapeHtml(message)}
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        if (document.getElementById('boss-agent-notification')) {
            notification.remove();
        }
    }, 3000);
}

// =============================================================================
// Initialization
// =============================================================================

// Log that content script is loaded
console.log('[Boss Agent] Content script loaded');
