/**
 * CRE Underwriting Engine - Content Script
 * Handles page interaction and data extraction
 */

// State
const contentState = {
  highlightedElements: [],
  tooltip: null,
};

// Initialize content script
function initialize() {
  console.log('CRE Underwriting Engine content script loaded');
  createTooltip();
  setupMessageListener();
}

// Create tooltip element
function createTooltip() {
  const tooltip = document.createElement('div');
  tooltip.id = 'cre-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    z-index: 999999;
    background: #1a365d;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s;
  `;
  document.body.appendChild(tooltip);
  contentState.tooltip = tooltip;
}

// Show tooltip at position
function showTooltip(x, y, content) {
  if (!contentState.tooltip) return;

  contentState.tooltip.innerHTML = content;
  contentState.tooltip.style.left = `${x + 10}px`;
  contentState.tooltip.style.top = `${y + 10}px`;
  contentState.tooltip.style.opacity = '1';

  // Ensure tooltip stays in viewport
  const rect = contentState.tooltip.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    contentState.tooltip.style.left = `${x - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    contentState.tooltip.style.top = `${y - rect.height - 10}px`;
  }
}

// Hide tooltip
function hideTooltip() {
  if (contentState.tooltip) {
    contentState.tooltip.style.opacity = '0';
  }
}

// Setup message listener
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'GET_SELECTION':
        const selection = window.getSelection().toString().trim();
        sendResponse({ text: selection });
        break;

      case 'CRE_VALIDATION_RESULT':
        displayValidationResult(message.data);
        sendResponse({ received: true });
        break;

      case 'CRE_MARKET_RESULT':
        displayMarketResult(message.data);
        sendResponse({ received: true });
        break;

      case 'EXTRACT_PAGE_DATA':
        const data = extractPageData();
        sendResponse({ data });
        break;

      case 'HIGHLIGHT_NUMBERS':
        highlightNumbers();
        sendResponse({ success: true });
        break;

      case 'CLEAR_HIGHLIGHTS':
        clearHighlights();
        sendResponse({ success: true });
        break;
    }
  });
}

// Display validation result as a floating notification
function displayValidationResult(result) {
  const notification = createNotification();

  if (result.is_valid) {
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: #38a169; font-size: 20px;">✓</span>
        <div>
          <strong>Lease Validation Passed</strong>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">
            ${result.checks_passed?.length || 0} checks passed
          </div>
        </div>
      </div>
    `;
  } else {
    const blockers = result.blockers?.length || 0;
    const warnings = result.warnings?.length || 0;

    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: #e53e3e; font-size: 20px;">!</span>
        <div>
          <strong>Validation Issues Found</strong>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">
            ${blockers} blocker(s), ${warnings} warning(s)
          </div>
        </div>
      </div>
    `;

    if (result.blockers?.length > 0) {
      const blockersList = result.blockers.map(b => `• ${b.check}: ${b.message}`).join('<br>');
      notification.innerHTML += `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee; font-size: 12px;">
          <strong style="color: #e53e3e;">Blockers:</strong><br>
          ${blockersList}
        </div>
      `;
    }
  }

  showNotification(notification);
}

// Display market result as a floating notification
function displayMarketResult(result) {
  const notification = createNotification();

  const capRate = result.cap_rate?.mean ? (result.cap_rate.mean * 100).toFixed(2) : '-';
  const rentGrowth = result.rent_growth?.mean ? (result.rent_growth.mean * 100).toFixed(2) : '-';
  const vacancy = result.vacancy?.mean ? (result.vacancy.mean * 100).toFixed(1) : '-';

  notification.innerHTML = `
    <div style="margin-bottom: 8px;">
      <strong>Market Simulation (OU Model)</strong>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
      <div>
        <div style="color: #666;">Cap Rate</div>
        <div style="font-weight: 600; color: #1a365d;">${capRate}%</div>
      </div>
      <div>
        <div style="color: #666;">Rent Growth</div>
        <div style="font-weight: 600; color: #1a365d;">${rentGrowth}%</div>
      </div>
      <div>
        <div style="color: #666;">Vacancy</div>
        <div style="font-weight: 600; color: #1a365d;">${vacancy}%</div>
      </div>
      <div>
        <div style="color: #666;">Paths</div>
        <div style="font-weight: 600; color: #1a365d;">${result.num_paths || '-'}</div>
      </div>
    </div>
    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; font-size: 10px; color: #888;">
      Using Ornstein-Uhlenbeck mean-reversion (NOT GBM)
    </div>
  `;

  showNotification(notification);
}

// Create notification element
function createNotification() {
  const existing = document.getElementById('cre-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.id = 'cre-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    background: white;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    max-width: 320px;
    border-left: 4px solid #1a365d;
    transform: translateX(100%);
    opacity: 0;
    transition: all 0.3s ease;
  `;

  return notification;
}

// Show notification with animation
function showNotification(notification) {
  document.body.appendChild(notification);

  // Add close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: #999;
    padding: 0;
    line-height: 1;
  `;
  closeBtn.onclick = () => hideNotification(notification);
  notification.appendChild(closeBtn);

  // Animate in
  requestAnimationFrame(() => {
    notification.style.transform = 'translateX(0)';
    notification.style.opacity = '1';
  });

  // Auto-hide after 10 seconds
  setTimeout(() => hideNotification(notification), 10000);
}

// Hide notification
function hideNotification(notification) {
  notification.style.transform = 'translateX(100%)';
  notification.style.opacity = '0';
  setTimeout(() => notification.remove(), 300);
}

// Extract potential CRE data from page
function extractPageData() {
  const data = {
    numbers: [],
    dates: [],
    currencies: [],
    percentages: [],
  };

  const text = document.body.innerText;

  // Extract numbers with context
  const numberPattern = /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(sf|sqft|square feet|rsf|usf)?/gi;
  let match;
  while ((match = numberPattern.exec(text)) !== null) {
    data.numbers.push({
      value: parseFloat(match[1].replace(/,/g, '')),
      unit: match[2]?.toLowerCase(),
      context: text.substring(Math.max(0, match.index - 30), match.index + match[0].length + 30),
    });
  }

  // Extract currency values
  const currencyPattern = /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
  while ((match = currencyPattern.exec(text)) !== null) {
    data.currencies.push({
      value: parseFloat(match[1].replace(/,/g, '')),
      context: text.substring(Math.max(0, match.index - 30), match.index + match[0].length + 30),
    });
  }

  // Extract percentages
  const percentPattern = /(\d+(?:\.\d+)?)\s*%/g;
  while ((match = percentPattern.exec(text)) !== null) {
    data.percentages.push({
      value: parseFloat(match[1]),
      context: text.substring(Math.max(0, match.index - 30), match.index + match[0].length + 30),
    });
  }

  // Extract dates
  const datePattern = /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;
  while ((match = datePattern.exec(text)) !== null) {
    data.dates.push(match[1]);
  }

  return data;
}

// Highlight numbers on page
function highlightNumbers() {
  clearHighlights();

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  const textNodes = [];
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.match(/\$[\d,]+|\d+(?:,\d{3})*(?:\.\d+)?\s*(?:sf|sqft|%)/i)) {
      textNodes.push(walker.currentNode);
    }
  }

  textNodes.forEach(node => {
    const parent = node.parentNode;
    if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') return;

    const html = node.textContent.replace(
      /(\$[\d,]+(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d+)?\s*(?:sf|sqft|%)?)/gi,
      '<span class="cre-highlight" style="background: rgba(49, 130, 206, 0.2); border-radius: 2px; padding: 0 2px;">$1</span>'
    );

    if (html !== node.textContent) {
      const span = document.createElement('span');
      span.innerHTML = html;
      parent.replaceChild(span, node);
      contentState.highlightedElements.push(span);
    }
  });
}

// Clear highlights
function clearHighlights() {
  contentState.highlightedElements.forEach(el => {
    if (el.parentNode) {
      const text = document.createTextNode(el.textContent);
      el.parentNode.replaceChild(text, el);
    }
  });
  contentState.highlightedElements = [];
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
