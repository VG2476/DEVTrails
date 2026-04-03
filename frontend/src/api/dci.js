/**
 * DCI (Disruption Composite Index) API Client
 * 
 * Maps to live backend routes with a mix of /api/v1 and root prefixes.
 */
import apiClient from './client.js';

export const dciAPI = {
  /**
   * Get current DCI score and 24hr history for a specific pincode.
   * GET /api/v1/dci/:pincode
   */
  getByPincode: (pincode) => {
    return apiClient.get(`/api/v1/dci/${pincode}`);
  },

  /**
   * Get latest DCI alerts across all active zones (score > 65).
   * GET /api/v1/dci-alerts/latest
   */
  getLatestAlerts: (limit = 3) => {
    return apiClient.get('/api/v1/dci-alerts/latest', { params: { limit } });
  },

  /**
   * Get total DCI triggers today (aggregate metric).
   * GET /api/v1/dci/total/today
   */
  getTodayTotal: () => {
    return apiClient.get('/api/v1/dci/total/today');
  },
};
