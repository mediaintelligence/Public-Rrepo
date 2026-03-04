/**
 * CRE Underwriting Engine - Utility Functions
 */

const CREUtils = {
  /**
   * Format currency values
   */
  formatCurrency(value, decimals = 0) {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  },

  /**
   * Format percentage values
   */
  formatPercent(value, decimals = 2) {
    if (value === null || value === undefined) return '-';
    return `${(value * 100).toFixed(decimals)}%`;
  },

  /**
   * Format large numbers with abbreviations
   */
  formatCompact(value) {
    if (value === null || value === undefined) return '-';
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  },

  /**
   * Format square footage
   */
  formatSqFt(value) {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US').format(Math.round(value)) + ' SF';
  },

  /**
   * Format date to ISO string (YYYY-MM-DD)
   */
  formatDateISO(date) {
    if (!date) return null;
    if (typeof date === 'string') return date;
    return date.toISOString().split('T')[0];
  },

  /**
   * Format date for display
   */
  formatDateDisplay(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  },

  /**
   * Calculate lease term in months
   */
  calculateLeaseTerm(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const months = (end.getFullYear() - start.getFullYear()) * 12 +
                   (end.getMonth() - start.getMonth());
    return Math.max(0, months);
  },

  /**
   * Calculate implied cap rate
   */
  calculateCapRate(noi, value) {
    if (!noi || !value || value === 0) return null;
    return noi / value;
  },

  /**
   * Calculate implied value from NOI and cap rate
   */
  calculateValue(noi, capRate) {
    if (!noi || !capRate || capRate === 0) return null;
    return noi / capRate;
  },

  /**
   * Calculate price per square foot
   */
  calculatePriceSF(price, sqft) {
    if (!price || !sqft || sqft === 0) return null;
    return price / sqft;
  },

  /**
   * Map credit rating to default probability (approximate)
   */
  creditRatingToDefaultProb(rating) {
    const ratings = {
      'AAA': 0.0001,
      'AA': 0.0005,
      'A': 0.001,
      'BBB': 0.005,
      'BB': 0.02,
      'B': 0.05,
      'CCC': 0.15,
      'NR': 0.03, // Not rated - assume moderate risk
    };
    return ratings[rating] || 0.03;
  },

  /**
   * Map property type to market parameters
   */
  getMarketParams(propertyType) {
    const params = {
      office: {
        theta_cap: 0.065,
        theta_rent: 0.02,
        theta_vacancy: 0.12,
        kappa: 0.3,
        sigma_cap: 0.008,
        sigma_rent: 0.015,
        sigma_vacancy: 0.03,
      },
      retail: {
        theta_cap: 0.070,
        theta_rent: 0.015,
        theta_vacancy: 0.08,
        kappa: 0.25,
        sigma_cap: 0.01,
        sigma_rent: 0.02,
        sigma_vacancy: 0.025,
      },
      industrial: {
        theta_cap: 0.055,
        theta_rent: 0.025,
        theta_vacancy: 0.05,
        kappa: 0.35,
        sigma_cap: 0.006,
        sigma_rent: 0.012,
        sigma_vacancy: 0.02,
      },
      multifamily: {
        theta_cap: 0.050,
        theta_rent: 0.03,
        theta_vacancy: 0.06,
        kappa: 0.4,
        sigma_cap: 0.005,
        sigma_rent: 0.01,
        sigma_vacancy: 0.015,
      },
      mixed_use: {
        theta_cap: 0.060,
        theta_rent: 0.02,
        theta_vacancy: 0.10,
        kappa: 0.3,
        sigma_cap: 0.007,
        sigma_rent: 0.015,
        sigma_vacancy: 0.025,
      },
      hospitality: {
        theta_cap: 0.085,
        theta_rent: 0.01,
        theta_vacancy: 0.25,
        kappa: 0.2,
        sigma_cap: 0.015,
        sigma_rent: 0.03,
        sigma_vacancy: 0.05,
      },
    };
    return params[propertyType] || params.office;
  },

  /**
   * Validate lease data completeness
   */
  validateLeaseData(leaseData) {
    const errors = [];
    const warnings = [];

    if (!leaseData.lease_type) errors.push('Lease type is required');
    if (!leaseData.rsf || leaseData.rsf <= 0) errors.push('Valid RSF is required');
    if (!leaseData.base_rent || leaseData.base_rent <= 0) errors.push('Valid base rent is required');
    if (!leaseData.commencement_date) errors.push('Commencement date is required');
    if (!leaseData.expiration_date) errors.push('Expiration date is required');

    // Check date order
    if (leaseData.commencement_date && leaseData.expiration_date) {
      if (new Date(leaseData.commencement_date) >= new Date(leaseData.expiration_date)) {
        errors.push('Expiration date must be after commencement date');
      }
    }

    // Warnings for unusual values
    if (leaseData.base_rent && leaseData.base_rent < 10) {
      warnings.push('Base rent seems unusually low');
    }
    if (leaseData.base_rent && leaseData.base_rent > 200) {
      warnings.push('Base rent seems unusually high');
    }

    const term = this.calculateLeaseTerm(leaseData.commencement_date, leaseData.expiration_date);
    if (term > 0 && term < 12) {
      warnings.push('Lease term is less than 1 year');
    }
    if (term > 300) {
      warnings.push('Lease term exceeds 25 years');
    }

    return { errors, warnings, isValid: errors.length === 0 };
  },

  /**
   * Generate Box-Muller standard normal random number
   */
  boxMullerRandom() {
    let u1, u2;
    do {
      u1 = Math.random();
      u2 = Math.random();
    } while (u1 === 0);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  },

  /**
   * Generate correlated normal random numbers using Cholesky decomposition
   */
  correlatedNormals(correlation, n = 2) {
    const z1 = this.boxMullerRandom();
    const z2 = this.boxMullerRandom();
    const x1 = z1;
    const x2 = correlation * z1 + Math.sqrt(1 - correlation * correlation) * z2;
    return [x1, x2];
  },

  /**
   * Debounce function for input handling
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Deep clone an object
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * Show notification
   */
  showNotification(title, message, type = 'info') {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '../../icons/icon48.png',
        title: title,
        message: message,
      });
    } else {
      console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
    }
  },

  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  },

  /**
   * Download data as JSON file
   */
  downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Download data as CSV file
   */
  downloadCSV(data, filename) {
    if (!Array.isArray(data) || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Get regime classification based on metrics
   */
  classifyMarketRegime(capRate, rentGrowth, vacancy) {
    // Simple regime classification
    if (capRate < 0.05 && rentGrowth > 0.03 && vacancy < 0.05) {
      return { regime: 'expansion', color: 'success', description: 'Strong growth phase' };
    }
    if (capRate > 0.08 && rentGrowth < 0 && vacancy > 0.15) {
      return { regime: 'recession', color: 'error', description: 'Market contraction' };
    }
    if (capRate > 0.07 && vacancy > 0.12) {
      return { regime: 'hypersupply', color: 'warning', description: 'Oversupply conditions' };
    }
    if (capRate < 0.06 && rentGrowth < 0.02 && vacancy < 0.08) {
      return { regime: 'recovery', color: 'info', description: 'Early recovery phase' };
    }
    return { regime: 'stable', color: 'neutral', description: 'Balanced market conditions' };
  },
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CREUtils };
}
