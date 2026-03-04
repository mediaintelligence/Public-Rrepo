/**
 * CRE Underwriting Engine - Side Panel Logic
 * Full analysis interface with tenant roll and Monte Carlo simulation
 */

// State management
const state = {
  tenants: [],
  nextTenantId: 1,
  analysisResults: null,
  isRunning: false,
};

// DOM Elements
const elements = {
  connectionStatus: document.getElementById('connectionStatus'),
  propertyForm: document.getElementById('propertyForm'),
  tenantList: document.getElementById('tenantList'),
  tenantTemplate: document.getElementById('tenantTemplate'),
  resultsSection: document.getElementById('resultsSection'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingProgress: document.getElementById('loadingProgress'),
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await CREApiClient.init();
  await checkConnection();
  setupEventListeners();
  loadSavedData();
});

// Check API connection
async function checkConnection() {
  try {
    const status = await CREApiClient.getStatus();
    elements.connectionStatus.classList.remove('error');
    elements.connectionStatus.classList.add('connected');
    elements.connectionStatus.querySelector('.status-text').textContent = 'Connected';
  } catch (error) {
    elements.connectionStatus.classList.remove('connected');
    elements.connectionStatus.classList.add('error');
    elements.connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
  }
}

// Setup event listeners
function setupEventListeners() {
  // Collapsible sections
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.section');
      section.classList.toggle('collapsed');
    });
  });

  // Add tenant button
  document.getElementById('addTenantBtn').addEventListener('click', addTenant);

  // Clear property button
  document.getElementById('clearPropertyBtn').addEventListener('click', clearPropertyForm);

  // Run analysis button
  document.getElementById('runAnalysisBtn').addEventListener('click', runAnalysis);

  // Export results button
  document.getElementById('exportResultsBtn')?.addEventListener('click', exportResults);

  // Settings button
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // History button
  document.getElementById('historyBtn').addEventListener('click', showHistory);

  // Auto-calculate derived fields
  setupAutoCalculations();
}

// Setup auto-calculations for property fields
function setupAutoCalculations() {
  const priceInput = document.getElementById('propPrice');
  const noiInput = document.getElementById('propNOI');
  const capRateInput = document.getElementById('propCapRate');

  // Calculate cap rate from NOI and price
  const calcCapRate = CREUtils.debounce(() => {
    const price = parseFloat(priceInput.value);
    const noi = parseFloat(noiInput.value);
    if (price && noi && !capRateInput.value) {
      capRateInput.value = ((noi / price) * 100).toFixed(2);
    }
  }, 500);

  priceInput.addEventListener('input', calcCapRate);
  noiInput.addEventListener('input', calcCapRate);
}

// Add a new tenant
function addTenant(existingData = null) {
  const template = elements.tenantTemplate.content.cloneNode(true);
  const card = template.querySelector('.tenant-card');
  const tenantId = state.nextTenantId++;

  card.dataset.tenantId = tenantId;

  // Populate if existing data
  if (existingData) {
    card.querySelector('.tenant-name').value = existingData.name || '';
    card.querySelector('.tenant-rsf').value = existingData.rsf || '';
    card.querySelector('.tenant-rent').value = existingData.base_rent || '';
    card.querySelector('.tenant-start').value = existingData.commencement_date || '';
    card.querySelector('.tenant-end').value = existingData.expiration_date || '';
    card.querySelector('.tenant-lease-type').value = existingData.lease_type || 'triple_net';
    card.querySelector('.tenant-credit').value = existingData.credit_rating || 'A';
  }

  // Remove tenant handler
  card.querySelector('.remove-tenant').addEventListener('click', () => {
    removeTenant(tenantId);
  });

  // Update summary on changes
  card.querySelectorAll('input, select').forEach(input => {
    input.addEventListener('change', updateTenantSummary);
  });

  elements.tenantList.appendChild(card);
  state.tenants.push({ id: tenantId });
  updateTenantSummary();
}

// Remove tenant
function removeTenant(tenantId) {
  const card = document.querySelector(`[data-tenant-id="${tenantId}"]`);
  if (card) {
    card.remove();
    state.tenants = state.tenants.filter(t => t.id !== tenantId);
    updateTenantSummary();
  }
}

// Update tenant summary
function updateTenantSummary() {
  const tenantCards = document.querySelectorAll('.tenant-card');
  let totalRSF = 0;
  let weightedTermSum = 0;

  tenantCards.forEach(card => {
    const rsf = parseFloat(card.querySelector('.tenant-rsf').value) || 0;
    const startDate = card.querySelector('.tenant-start').value;
    const endDate = card.querySelector('.tenant-end').value;

    totalRSF += rsf;

    if (startDate && endDate) {
      const termMonths = CREUtils.calculateLeaseTerm(startDate, endDate);
      weightedTermSum += rsf * termMonths;
    }
  });

  const waltMonths = totalRSF > 0 ? weightedTermSum / totalRSF : 0;
  const waltYears = waltMonths / 12;

  document.getElementById('totalTenants').textContent = tenantCards.length;
  document.getElementById('totalRSF').textContent = CREUtils.formatSqFt(totalRSF);
  document.getElementById('waltYears').textContent = waltYears > 0 ? `${waltYears.toFixed(1)} years` : '- years';
}

// Get property data from form
function getPropertyData() {
  return {
    name: document.getElementById('propName').value,
    property_type: document.getElementById('propType').value,
    rsf: parseFloat(document.getElementById('propRSF').value) || 0,
    purchase_price: parseFloat(document.getElementById('propPrice').value) || 0,
    noi: parseFloat(document.getElementById('propNOI').value) || 0,
    cap_rate: parseFloat(document.getElementById('propCapRate').value) / 100 || 0,
    submarket: document.getElementById('propSubmarket').value,
    occupancy: parseFloat(document.getElementById('propOccupancy').value) / 100 || 0,
  };
}

// Get tenant data from forms
function getTenantData() {
  const tenants = [];
  document.querySelectorAll('.tenant-card').forEach(card => {
    tenants.push({
      name: card.querySelector('.tenant-name').value,
      rsf: parseFloat(card.querySelector('.tenant-rsf').value) || 0,
      base_rent: parseFloat(card.querySelector('.tenant-rent').value) || 0,
      commencement_date: card.querySelector('.tenant-start').value,
      expiration_date: card.querySelector('.tenant-end').value,
      lease_type: card.querySelector('.tenant-lease-type').value,
      credit_rating: card.querySelector('.tenant-credit').value,
    });
  });
  return tenants;
}

// Get analysis configuration
function getAnalysisConfig() {
  return {
    hold_period: parseInt(document.getElementById('holdPeriod').value) || 10,
    num_simulations: parseInt(document.getElementById('numSimulations').value) || 10000,
    exit_cap_spread_bps: parseInt(document.getElementById('exitCapSpread').value) || 25,
    discount_rate: parseFloat(document.getElementById('discountRate').value) / 100 || 0.08,
    include_stress_test: document.getElementById('includeStressTest').checked,
    include_refi_stress: document.getElementById('includeRefiStress').checked,
  };
}

// Run full analysis
async function runAnalysis() {
  if (state.isRunning) return;

  const property = getPropertyData();
  const tenants = getTenantData();
  const config = getAnalysisConfig();

  // Validate inputs
  if (!property.property_type) {
    alert('Please select a property type.');
    return;
  }

  if (!property.rsf || property.rsf <= 0) {
    alert('Please enter a valid RSF.');
    return;
  }

  state.isRunning = true;
  showLoading('Initializing analysis...');

  try {
    // Prepare request payload
    const payload = {
      property: property,
      tenants: tenants,
      config: config,
    };

    updateLoadingProgress('Running Monte Carlo simulation...');

    // Call API
    const results = await CREApiClient.runUnderwriting(payload);

    state.analysisResults = results;
    displayResults(results);

    // Save run to history
    chrome.runtime.sendMessage({
      type: 'SAVE_RUN',
      data: {
        property: property,
        tenants: tenants,
        config: config,
        results: results,
      },
    });

  } catch (error) {
    console.error('Analysis error:', error);
    alert(`Analysis failed: ${error.message}`);
  } finally {
    state.isRunning = false;
    hideLoading();
  }
}

// Display results
function displayResults(results) {
  elements.resultsSection.classList.remove('hidden');

  // Key metrics
  setMetricValue('resultIRR', CREUtils.formatPercent(results.irr?.mean, 1));
  setMetricRange('resultIRRRange', results.irr?.p10, results.irr?.p90, true);

  setMetricValue('resultEM', results.equity_multiple?.mean?.toFixed(2) + 'x');
  setMetricRange('resultEMRange', results.equity_multiple?.p10, results.equity_multiple?.p90, false, 'x');

  setMetricValue('resultNPV', CREUtils.formatCompact(results.npv?.mean));

  setMetricValue('resultExitValue', CREUtils.formatCompact(results.exit_value?.mean));
  setMetricRange('resultExitRange', results.exit_value?.p10, results.exit_value?.p90);

  // Risk metrics
  setMetricValue('resultVaR', CREUtils.formatCompact(results.var_95));
  setMetricValue('resultDefaultProb', CREUtils.formatPercent(results.default_probability, 1));
  setMetricValue('resultBreakeven', CREUtils.formatPercent(results.breakeven_occupancy, 0));
  setMetricValue('resultDSCR', results.dscr_yr1?.toFixed(2) + 'x');

  // Market projections
  setMetricValue('resultCapRate', CREUtils.formatPercent(results.market?.cap_rate_exit, 1));
  setMetricValue('resultRentGrowth', CREUtils.formatPercent(results.market?.rent_growth_cagr, 1));
  setMetricValue('resultVacancy', CREUtils.formatPercent(results.market?.vacancy_terminal, 0));

  const regime = CREUtils.classifyMarketRegime(
    results.market?.cap_rate_exit,
    results.market?.rent_growth_cagr,
    results.market?.vacancy_terminal
  );
  setMetricValue('resultRegime', regime.regime.toUpperCase());

  // Validation summary
  displayValidationSummary(results.validation);

  // Scroll to results
  elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Helper to set metric value
function setMetricValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '-';
}

// Helper to set metric range
function setMetricRange(id, low, high, isPercent = false, suffix = '') {
  const el = document.getElementById(id);
  if (el && low !== undefined && high !== undefined) {
    if (isPercent) {
      el.textContent = `${CREUtils.formatPercent(low, 1)} - ${CREUtils.formatPercent(high, 1)}`;
    } else {
      el.textContent = `${CREUtils.formatCompact(low)} - ${CREUtils.formatCompact(high)}${suffix}`;
    }
  }
}

// Display validation summary
function displayValidationSummary(validation) {
  const container = document.getElementById('validationSummary');
  container.innerHTML = '';

  if (!validation) {
    container.innerHTML = '<div class="validation-item pass"><span class="validation-icon">✓</span> No validation issues</div>';
    return;
  }

  // Blockers
  if (validation.blockers?.length > 0) {
    validation.blockers.forEach(item => {
      container.innerHTML += `
        <div class="validation-item blocker">
          <span class="validation-icon">✗</span>
          <span>${item.check}: ${item.message}</span>
        </div>
      `;
    });
  }

  // Warnings
  if (validation.warnings?.length > 0) {
    validation.warnings.forEach(item => {
      container.innerHTML += `
        <div class="validation-item warning">
          <span class="validation-icon">!</span>
          <span>${item.check}: ${item.message}</span>
        </div>
      `;
    });
  }

  // Passed checks (summary)
  if (validation.checks_passed?.length > 0) {
    container.innerHTML += `
      <div class="validation-item pass">
        <span class="validation-icon">✓</span>
        <span>${validation.checks_passed.length} validation checks passed</span>
      </div>
    `;
  }
}

// Show loading overlay
function showLoading(text) {
  elements.loadingOverlay.classList.remove('hidden');
  elements.loadingOverlay.querySelector('.loading-text').textContent = text || 'Loading...';
  elements.loadingProgress.textContent = '';
}

// Update loading progress
function updateLoadingProgress(text) {
  elements.loadingProgress.textContent = text;
}

// Hide loading overlay
function hideLoading() {
  elements.loadingOverlay.classList.add('hidden');
}

// Clear property form
function clearPropertyForm() {
  elements.propertyForm.reset();
  elements.resultsSection.classList.add('hidden');
  state.analysisResults = null;
}

// Export results
function exportResults() {
  if (!state.analysisResults) {
    alert('No results to export.');
    return;
  }

  const exportData = {
    timestamp: new Date().toISOString(),
    property: getPropertyData(),
    tenants: getTenantData(),
    config: getAnalysisConfig(),
    results: state.analysisResults,
  };

  const filename = `cre_analysis_${new Date().toISOString().split('T')[0]}.json`;
  CREUtils.downloadJSON(exportData, filename);
}

// Show history
function showHistory() {
  chrome.storage.local.get(['recentRuns'], (data) => {
    const runs = data.recentRuns || [];
    if (runs.length === 0) {
      alert('No previous runs found.');
      return;
    }

    // Create simple history modal
    const runsList = runs.slice(0, 10).map((run, i) => {
      const date = new Date(run.timestamp).toLocaleDateString();
      const name = run.property?.name || 'Unnamed Property';
      const irr = run.results?.irr?.mean ? CREUtils.formatPercent(run.results.irr.mean, 1) : '-';
      return `${i + 1}. ${name} (${date}) - IRR: ${irr}`;
    }).join('\n');

    alert(`Recent Analysis Runs:\n\n${runsList}`);
  });
}

// Load saved data on startup
function loadSavedData() {
  chrome.storage.local.get(['lastPropertyData', 'lastTenantData'], (data) => {
    // Could restore last session if needed
  });
}

// Save data on changes
function saveCurrentData() {
  const property = getPropertyData();
  const tenants = getTenantData();
  chrome.storage.local.set({
    lastPropertyData: property,
    lastTenantData: tenants,
  });
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'LOAD_PROPERTY':
      // Load property data from external source
      if (message.data) {
        populatePropertyForm(message.data);
      }
      break;
  }
});

// Populate property form with data
function populatePropertyForm(data) {
  if (data.name) document.getElementById('propName').value = data.name;
  if (data.property_type) document.getElementById('propType').value = data.property_type;
  if (data.rsf) document.getElementById('propRSF').value = data.rsf;
  if (data.purchase_price) document.getElementById('propPrice').value = data.purchase_price;
  if (data.noi) document.getElementById('propNOI').value = data.noi;
  if (data.cap_rate) document.getElementById('propCapRate').value = data.cap_rate * 100;
  if (data.submarket) document.getElementById('propSubmarket').value = data.submarket;
  if (data.occupancy) document.getElementById('propOccupancy').value = data.occupancy * 100;
}

console.log('CRE Underwriting Engine Side Panel initialized');
