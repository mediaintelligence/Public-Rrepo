/**
 * CRE Underwriting Engine - API Client
 * Handles all communication with the MIZ OKI CRE API
 */

const CREApiClient = {
  // API Configuration
  config: {
    baseUrl: 'https://boss-agent-adk-698171499447.us-central1.run.app',
    endpoints: {
      status: '/api/v1/cre-underwriting/status',
      underwrite: '/api/v1/cre-underwriting/underwrite',
      validateLease: '/api/v1/cre-underwriting/validate-lease',
      simulateMarket: '/api/v1/cre-underwriting/simulate-market',
      simulateDefaults: '/api/v1/cre-underwriting/simulate-defaults',
      compileCashFlows: '/api/v1/cre-underwriting/compile-cash-flows',
      guardrails: '/api/v1/cre-underwriting/guardrails',
      runs: '/api/v1/cre-underwriting/runs',
    },
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
  },

  // Auth token (retrieved from storage)
  authToken: null,

  /**
   * Initialize the API client
   */
  async init() {
    try {
      const data = await chrome.storage.local.get(['apiToken', 'apiUrl']);
      if (data.apiToken) {
        this.authToken = data.apiToken;
      }
      if (data.apiUrl) {
        this.config.baseUrl = data.apiUrl;
      }
    } catch (error) {
      console.warn('Failed to load API config from storage:', error);
    }
  },

  /**
   * Make an authenticated API request
   */
  async request(endpoint, options = {}) {
    const url = this.config.baseUrl + endpoint;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    const headers = {
      'Content-Type': 'application/json',
      'X-Client': 'CRE-Chrome-Extension',
      'X-Version': '1.0.0',
      ...options.headers,
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new CREApiError(
          errorBody.detail || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new CREApiError('Request timeout', 408);
      }

      if (error instanceof CREApiError) {
        throw error;
      }

      throw new CREApiError(error.message, 0);
    }
  },

  /**
   * Retry wrapper for requests
   */
  async requestWithRetry(endpoint, options = {}, retries = this.config.retries) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.request(endpoint, options);
      } catch (error) {
        lastError = error;

        // Don't retry on client errors (4xx)
        if (error.status >= 400 && error.status < 500) {
          throw error;
        }

        // Wait before retrying
        if (attempt < retries) {
          await new Promise(resolve =>
            setTimeout(resolve, this.config.retryDelay * Math.pow(2, attempt))
          );
        }
      }
    }

    throw lastError;
  },

  // =========================================================================
  // API Methods
  // =========================================================================

  /**
   * Get CRE Engine status
   */
  async getStatus() {
    return this.requestWithRetry(this.config.endpoints.status);
  },

  /**
   * Run full underwriting analysis
   */
  async runUnderwriting(params) {
    return this.requestWithRetry(this.config.endpoints.underwrite, {
      method: 'POST',
      body: params,
    });
  },

  /**
   * Validate lease against guardrails
   */
  async validateLease(leaseData, baseYearExpenses = null, validateAll = true) {
    return this.requestWithRetry(this.config.endpoints.validateLease, {
      method: 'POST',
      body: {
        lease_data: leaseData,
        base_year_expenses: baseYearExpenses,
        validate_all: validateAll,
      },
    });
  },

  /**
   * Simulate market dynamics using OU process
   */
  async simulateMarket(params) {
    return this.requestWithRetry(this.config.endpoints.simulateMarket, {
      method: 'POST',
      body: params,
    });
  },

  /**
   * Simulate correlated tenant defaults using t-copula
   */
  async simulateDefaults(tenants, correlationMatrix = null, copulaDf = 5, numSimulations = 10000) {
    return this.requestWithRetry(this.config.endpoints.simulateDefaults, {
      method: 'POST',
      body: {
        tenants,
        correlation_matrix: correlationMatrix,
        copula_df: copulaDf,
        num_simulations: numSimulations,
        random_seed: Date.now(),
      },
    });
  },

  /**
   * Compile lease cash flows
   */
  async compileCashFlows(leaseData, startDate, endDate, options = {}) {
    return this.requestWithRetry(this.config.endpoints.compileCashFlows, {
      method: 'POST',
      body: {
        lease_data: leaseData,
        start_date: startDate,
        end_date: endDate,
        gross_up_occupancy: options.grossUpOccupancy || 0.95,
        expense_growth_rate: options.expenseGrowthRate || 0.03,
        base_year_expenses: options.baseYearExpenses || null,
      },
    });
  },

  /**
   * Get validation guardrails
   */
  async getGuardrails() {
    return this.requestWithRetry(this.config.endpoints.guardrails);
  },

  /**
   * Get underwriting run by ID
   */
  async getRun(runId) {
    return this.requestWithRetry(`${this.config.endpoints.runs}/${runId}`);
  },

  /**
   * Set API token
   */
  setToken(token) {
    this.authToken = token;
    chrome.storage.local.set({ apiToken: token });
  },

  /**
   * Set API base URL
   */
  setBaseUrl(url) {
    this.config.baseUrl = url;
    chrome.storage.local.set({ apiUrl: url });
  },
};

/**
 * Custom error class for API errors
 */
class CREApiError extends Error {
  constructor(message, status, body = null) {
    super(message);
    this.name = 'CREApiError';
    this.status = status;
    this.body = body;
  }
}

// Initialize on load
CREApiClient.init();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CREApiClient, CREApiError };
}
