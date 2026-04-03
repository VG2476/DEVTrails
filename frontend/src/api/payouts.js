/**
 * Payout API Client
 *
 * Maps ONLY to real backend routes in api/payouts.py (prefix: /api):
 *   GET  /api/payouts             → List payouts with optional filters
 *   GET  /api/payouts/:id         → Single payout record
 *   GET  /api/payouts/total/today → Aggregate of total disbursed today
 *   POST /api/calculate_payout    → ML-driven payout projection
 */
import apiClient from './client.js';

const ENDPOINT = '/api/v1/payouts';

export const payoutAPI = {
  /**
   * List all payout records with optional filters (status, zone, date range).
   * GET /api/v1/payouts
   */
  getAll: (params = {}) => {
    return apiClient.get(ENDPOINT, { params });
  },

  /**
   * Fetch a single payout record by ID.
   * GET /api/v1/payouts/:id
   */
  getById: (id) => {
    return apiClient.get(`${ENDPOINT}/${id}`);
  },

  /**
   * Get total amount of payouts disbursed in the current UTC day.
   * GET /api/v1/payouts/total/today
   */
  getTodayTotal: () => {
    return apiClient.get(`${ENDPOINT}/total/today`);
  },

  /**
   * Project a payout amount based on a hypothetical disruption and worker ID.
   * POST /api/v1/calculate_payout
   */
  calculateProjection: (data) => {
    return apiClient.post('/api/v1/calculate_payout', data);
  },
};
