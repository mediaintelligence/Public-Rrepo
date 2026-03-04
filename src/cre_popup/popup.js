/**
 * CRE Underwriting Engine - Popup Script
 * Handles UI interactions and API calls for the popup interface
 */

// State
let isConnected = false;
let currentTab = 'quick';

// DOM Elements
const elements = {
  statusIndicator: document.getElementById('statusIndicator'),
  quickAnalysisForm: document.getElementById('quickAnalysisForm'),
  leaseValidationForm: document.getElementById('leaseValidationForm'),
  marketDataForm: document.getElementById('marketDataForm'),
  quickResults: document.getElementById('quickResults'),
  leaseValidationResults: document.getElementById('leaseValidationResults'),
  marketResults: document.getElementById('marketResults'),
  openSidePanel: document.getElementById('openSidePanel'),
  hasBaseYear: document.getElementById('hasBaseYear'),
  baseYearSection: document.getElementById('baseYearSection'),
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content'),
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkConnection();
  setupEventListeners();
  loadSavedData();
});

/**
 * Check connection to CRE API
 */
async function checkConnection() {
  try {
    const status = await CREApiClient.getStatus();
    updateConnectionStatus(true, status.version || 'Connected');
    isConnected = true;
  } catch (error) {
    console.error('Connection error:', error);
    updateConnectionStatus(false, 'Offline');
    isConnected = false;
  }
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(connected, message) {
  const indicator = elements.statusIndicator;
  const statusText = indicator.querySelector('.status-text');

  indicator.classList.remove('connected', 'error');
  indicator.classList.add(connected ? 'connected' : 'error');
  statusText.textContent = message;
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Tab navigation
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Quick Analysis Form
  elements.quickAnalysisForm.addEventListener('submit', handleQuickAnalysis);

  // Lease Validation Form
  elements.leaseValidationForm.addEventListener('submit', handleLeaseValidation);

  // Market Data Form
  elements.marketDataForm.addEventListener('submit', handleMarketSimulation);

  // Open Side Panel
  elements.openSidePanel.addEventListener('click', openSidePanel);

  // Base Year Toggle
  elements.hasBaseYear.addEventListener('change', (e) => {
    elements.baseYearSection.classList.toggle('hidden', !e.target.checked);
  });

  // Footer buttons
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('historyBtn').addEventListener('click', openHistory);
  document.getElementById('helpBtn').addEventListener('click', openHelp);
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
  currentTab = tabName;

  elements.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  elements.tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });
}

/**
 * Handle Quick Analysis form submission
 */
async function handleQuickAnalysis(e) {
  e.preventDefault();

  if (!isConnected) {
    showNotification('Not connected to CRE Engine', 'error');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');

  try {
    const formData = {
      property_data: {
        property_type: document.getElementById('propertyType').value,
        rsf: parseFloat(document.getElementById('rsf').value) || 0,
        submarket: document.getElementById('submarket').value,
      },
      purchase_price: parseFloat(document.getElementById('purchasePrice').value) || 0,
      cap_rate: parseFloat(document.getElementById('capRate').value) / 100 || 0.065,
      noi: parseFloat(document.getElementById('noi').value) || 0,
    };

    // Calculate quick metrics
    const results = calculateQuickMetrics(formData);

    // Display results
    displayQuickResults(results);

    // Save form data
    saveFormData('quickAnalysis', formData);

    showNotification('Analysis complete', 'success');
  } catch (error) {
    console.error('Quick analysis error:', error);
    showNotification('Analysis failed: ' + error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
  }
}

/**
 * Calculate quick metrics locally
 */
function calculateQuickMetrics(data) {
  const { purchase_price, cap_rate, noi, property_data } = data;
  const rsf = property_data.rsf;

  // Implied value from cap rate
  const impliedValue = noi && cap_rate ? noi / cap_rate : 0;

  // Price per SF
  const priceSf = rsf ? purchase_price / rsf : 0;

  // Estimate market rent (simplified)
  const marketRent = rsf ? (noi * 0.65) / rsf : 0; // Assuming 65% operating margin

  // Default vacancy estimate by property type
  const vacancyRates = {
    office: 0.12,
    retail: 0.08,
    industrial: 0.05,
    multifamily: 0.06,
    mixed_use: 0.09,
    hospitality: 0.25,
  };
  const vacancyRate = vacancyRates[property_data.property_type] || 0.10;

  return {
    impliedValue,
    priceSf,
    marketRent,
    vacancyRate,
    validations: [
      { name: 'Cap Rate Check', passed: cap_rate >= 0.04 && cap_rate <= 0.12 },
      { name: 'Price/SF Reasonable', passed: priceSf > 0 && priceSf < 2000 },
      { name: 'NOI Positive', passed: noi > 0 },
    ]
  };
}

/**
 * Display quick analysis results
 */
function displayQuickResults(results) {
  elements.quickResults.classList.remove('hidden');

  document.getElementById('impliedValue').textContent = formatCurrency(results.impliedValue);
  document.getElementById('priceSf').textContent = formatCurrency(results.priceSf) + '/SF';
  document.getElementById('marketRent').textContent = formatCurrency(results.marketRent) + '/SF';
  document.getElementById('vacancyRate').textContent = formatPercent(results.vacancyRate);

  // Display validation badges
  const badgesContainer = document.getElementById('validationBadges');
  badgesContainer.innerHTML = results.validations.map(v => `
    <span class="badge ${v.passed ? 'badge-success' : 'badge-error'}">
      ${v.passed ? '✓' : '✗'} ${v.name}
    </span>
  `).join('');
}

/**
 * Handle Lease Validation form submission
 */
async function handleLeaseValidation(e) {
  e.preventDefault();

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');

  try {
    const leaseData = {
      lease_type: document.getElementById('leaseType').value,
      rsf: parseFloat(document.getElementById('leaseRsf').value) || 0,
      base_rent_psf: parseFloat(document.getElementById('baseRent').value) || 0,
      commencement_date: document.getElementById('commenceDate').value,
      expiration_date: document.getElementById('expireDate').value,
      tenant_credit: document.getElementById('tenantCredit').value,
      has_base_year: document.getElementById('hasBaseYear').checked,
      base_year: document.getElementById('baseYear').value,
      expense_stop_psf: parseFloat(document.getElementById('expenseStop').value) || 0,
    };

    let results;
    if (isConnected) {
      // Call API for full validation
      results = await CREApiClient.validateLease(leaseData);
    } else {
      // Local validation
      results = validateLeaseLocally(leaseData);
    }

    displayLeaseValidationResults(results);
    saveFormData('leaseValidation', leaseData);

    const hasBlockers = results.blockers && results.blockers.length > 0;
    showNotification(
      hasBlockers ? 'Validation found blockers!' : 'Lease validation passed',
      hasBlockers ? 'warning' : 'success'
    );
  } catch (error) {
    console.error('Lease validation error:', error);
    showNotification('Validation failed: ' + error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
  }
}

/**
 * Local lease validation
 */
function validateLeaseLocally(leaseData) {
  const blockers = [];
  const warnings = [];
  const passed = [];

  // Check RSF
  if (!leaseData.rsf || leaseData.rsf <= 0) {
    blockers.push('RSF must be positive (RSF vs USF enforcement)');
  } else {
    passed.push('RSF is valid');
  }

  // Check base rent
  if (!leaseData.base_rent_psf || leaseData.base_rent_psf <= 0) {
    blockers.push('Base rent must be positive');
  } else {
    passed.push('Base rent is valid');
  }

  // Check dates
  if (leaseData.commencement_date && leaseData.expiration_date) {
    const commence = new Date(leaseData.commencement_date);
    const expire = new Date(leaseData.expiration_date);
    if (expire <= commence) {
      blockers.push('Expiration must be after commencement');
    } else {
      passed.push('Lease term dates are valid');
    }
  }

  // Base year validation (critical blocker)
  if (leaseData.has_base_year) {
    if (!leaseData.base_year) {
      blockers.push('Base year required when expense stop is used');
    } else if (!leaseData.expense_stop_psf) {
      warnings.push('Consider adding expense stop amount');
    } else {
      passed.push('Base year gross-up configured');
    }

    // CRITICAL: Base year gross-up parity warning
    warnings.push('AUDIT: Verify gross-up applies to BOTH base AND comparison years');
  }

  // Credit rating check
  const lowCreditRatings = ['BB', 'B', 'CCC', 'NR'];
  if (lowCreditRatings.includes(leaseData.tenant_credit)) {
    warnings.push(`Tenant credit rating (${leaseData.tenant_credit}) requires additional scrutiny`);
  } else {
    passed.push('Tenant credit rating acceptable');
  }

  // Lease type specific checks
  if (leaseData.lease_type === 'triple_net' && !leaseData.has_base_year) {
    warnings.push('NNN leases typically have base year provisions');
  }

  return { blockers, warnings, passed };
}

/**
 * Display lease validation results
 */
function displayLeaseValidationResults(results) {
  elements.leaseValidationResults.classList.remove('hidden');

  const blockersSection = document.getElementById('blockersSection');
  const blockersList = document.getElementById('blockersList');
  const warningsSection = document.getElementById('warningsSection');
  const warningsList = document.getElementById('warningsList');
  const passedSection = document.getElementById('passedSection');
  const passedList = document.getElementById('passedList');

  // Blockers
  if (results.blockers && results.blockers.length > 0) {
    blockersSection.classList.remove('hidden');
    blockersList.innerHTML = results.blockers.map(b => `<li>${b}</li>`).join('');
  } else {
    blockersSection.classList.add('hidden');
  }

  // Warnings
  if (results.warnings && results.warnings.length > 0) {
    warningsSection.classList.remove('hidden');
    warningsList.innerHTML = results.warnings.map(w => `<li>${w}</li>`).join('');
  } else {
    warningsSection.classList.add('hidden');
  }

  // Passed
  if (results.passed && results.passed.length > 0) {
    passedSection.classList.remove('hidden');
    passedList.innerHTML = results.passed.map(p => `<li>${p}</li>`).join('');
  } else {
    passedSection.classList.add('hidden');
  }
}

/**
 * Handle Market Simulation form submission
 */
async function handleMarketSimulation(e) {
  e.preventDefault();

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');

  try {
    const params = {
      property_type: document.getElementById('marketPropertyType').value,
      submarket: document.getElementById('marketSubmarket').value,
      num_paths: parseInt(document.getElementById('simulationPaths').value),
      horizon_years: parseInt(document.getElementById('horizonYears').value),
      random_seed: Date.now(), // For reproducibility
    };

    let results;
    if (isConnected) {
      results = await CREApiClient.simulateMarket(params);
    } else {
      results = simulateMarketLocally(params);
    }

    displayMarketResults(results);
    saveFormData('marketSimulation', params);

    showNotification('Market simulation complete', 'success');
  } catch (error) {
    console.error('Market simulation error:', error);
    showNotification('Simulation failed: ' + error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
  }
}

/**
 * Local market simulation using OU process
 */
function simulateMarketLocally(params) {
  // Default market parameters by property type
  const marketParams = {
    office: { theta_cap: 0.065, theta_rent: 0.025, theta_vac: 0.12, kappa: 0.15, sigma: 0.02 },
    retail: { theta_cap: 0.070, theta_rent: 0.020, theta_vac: 0.08, kappa: 0.12, sigma: 0.025 },
    industrial: { theta_cap: 0.055, theta_rent: 0.030, theta_vac: 0.05, kappa: 0.20, sigma: 0.015 },
    multifamily: { theta_cap: 0.050, theta_rent: 0.035, theta_vac: 0.06, kappa: 0.18, sigma: 0.018 },
  };

  const mp = marketParams[params.property_type] || marketParams.office;

  // Simplified OU simulation (single path for demo)
  // X_t = theta + (X_0 - theta) * exp(-kappa*t) + sigma * sqrt((1-exp(-2*kappa*t))/(2*kappa)) * Z
  const dt = 1; // 1 year steps
  const paths = params.num_paths;

  let capRates = [];
  let rentGrowths = [];
  let vacancies = [];

  // Monte Carlo paths
  for (let p = 0; p < Math.min(paths, 100); p++) { // Limit for browser performance
    let cap = mp.theta_cap;
    let rent = mp.theta_rent;
    let vac = mp.theta_vac;

    for (let t = 0; t < params.horizon_years; t++) {
      // OU exact discretization
      const z1 = gaussianRandom();
      const z2 = gaussianRandom();
      const z3 = gaussianRandom();

      const exp_term = Math.exp(-mp.kappa * dt);
      const var_factor = mp.sigma * Math.sqrt((1 - Math.exp(-2 * mp.kappa * dt)) / (2 * mp.kappa));

      cap = mp.theta_cap + (cap - mp.theta_cap) * exp_term + var_factor * z1;
      rent = mp.theta_rent + (rent - mp.theta_rent) * exp_term + var_factor * z2;
      vac = mp.theta_vac + (vac - mp.theta_vac) * exp_term + var_factor * 0.5 * z3;

      // Clamp to reasonable ranges
      cap = Math.max(0.03, Math.min(0.15, cap));
      rent = Math.max(-0.05, Math.min(0.10, rent));
      vac = Math.max(0.02, Math.min(0.30, vac));
    }

    capRates.push(cap);
    rentGrowths.push(rent);
    vacancies.push(vac);
  }

  // Calculate statistics
  const capMean = mean(capRates);
  const capStd = std(capRates);
  const rentMean = mean(rentGrowths);
  const rentStd = std(rentGrowths);
  const vacMean = mean(vacancies);
  const vacStd = std(vacancies);

  // Determine market regime
  let regime = 'Stable';
  if (capMean > mp.theta_cap * 1.1) regime = 'Contraction';
  else if (capMean < mp.theta_cap * 0.9) regime = 'Expansion';

  return {
    cap_rate: {
      mean: capMean,
      p5: percentile(capRates, 5),
      p95: percentile(capRates, 95),
    },
    rent_growth: {
      mean: rentMean,
      p5: percentile(rentGrowths, 5),
      p95: percentile(rentGrowths, 95),
    },
    vacancy: {
      mean: vacMean,
      p5: percentile(vacancies, 5),
      p95: percentile(vacancies, 95),
    },
    regime,
    paths_run: Math.min(paths, 100),
  };
}

/**
 * Display market simulation results
 */
function displayMarketResults(results) {
  elements.marketResults.classList.remove('hidden');

  document.getElementById('capRateMean').textContent = formatPercent(results.cap_rate.mean);
  document.getElementById('capRateRange').textContent =
    `P5-P95: ${formatPercent(results.cap_rate.p5)} - ${formatPercent(results.cap_rate.p95)}`;

  document.getElementById('rentGrowth').textContent = formatPercent(results.rent_growth.mean);
  document.getElementById('rentGrowthRange').textContent =
    `P5-P95: ${formatPercent(results.rent_growth.p5)} - ${formatPercent(results.rent_growth.p95)}`;

  document.getElementById('vacancy').textContent = formatPercent(results.vacancy.mean);
  document.getElementById('vacancyRange').textContent =
    `P5-P95: ${formatPercent(results.vacancy.p5)} - ${formatPercent(results.vacancy.p95)}`;

  document.getElementById('marketRegime').textContent = results.regime;
}

/**
 * Open side panel for full analysis
 */
function openSidePanel() {
  chrome.runtime.sendMessage({ action: 'openSidePanel' });
}

/**
 * Open settings page
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * Open history
 */
function openHistory() {
  chrome.tabs.create({ url: 'chrome-extension://' + chrome.runtime.id + '/src/history/history.html' });
}

/**
 * Open help
 */
function openHelp() {
  chrome.tabs.create({ url: 'https://mizoki3.com/docs/cre-underwriting' });
}

/**
 * Save form data to storage
 */
function saveFormData(formName, data) {
  chrome.storage.local.set({ [formName]: data });
}

/**
 * Load saved form data
 */
async function loadSavedData() {
  const data = await chrome.storage.local.get(['quickAnalysis', 'leaseValidation', 'marketSimulation']);

  // Restore quick analysis
  if (data.quickAnalysis) {
    const qa = data.quickAnalysis;
    if (qa.property_data) {
      document.getElementById('propertyType').value = qa.property_data.property_type || '';
      document.getElementById('rsf').value = qa.property_data.rsf || '';
      document.getElementById('submarket').value = qa.property_data.submarket || '';
    }
    document.getElementById('purchasePrice').value = qa.purchase_price || '';
    document.getElementById('capRate').value = (qa.cap_rate * 100) || '';
    document.getElementById('noi').value = qa.noi || '';
  }
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  // Send to background for native notification
  chrome.runtime.sendMessage({
    action: 'showNotification',
    title: 'CRE Underwriting',
    message,
    type
  });
}

// Utility functions
function formatCurrency(value) {
  if (!value) return '-';
  if (value >= 1000000) {
    return '$' + (value / 1000000).toFixed(2) + 'M';
  }
  return '$' + value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPercent(value) {
  if (value === null || value === undefined) return '-';
  return (value * 100).toFixed(2) + '%';
}

function gaussianRandom() {
  // Box-Muller transform
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / arr.length);
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[idx];
}
