/**
 * Worker API endpoints
 */
import apiClient from './client.js';

const ENDPOINT = '/api/workers';

export const workerAPI = {
  /**
   * Get all workers with pagination and filters
   */
  getAll: async (params = {}) => {
    try {
      return await apiClient.get(ENDPOINT, { params });
    } catch {
      return await apiClient.get('/api/api/workers', { params });
    }
  },

  /**
   * Get single worker by ID
   */
  getById: async (id) => {
    try {
      return await apiClient.get(`${ENDPOINT}/${id}`);
    } catch {
      return await apiClient.get(`/api/api/workers/${id}`);
    }
  },

  /**
   * Create new worker
   */
  create: (data) => {
    return apiClient.post(ENDPOINT, data);
  },

  /**
   * Update worker
   */
  update: (id, data) => {
    return apiClient.patch(`${ENDPOINT}/${id}`, data);
  },

  /**
   * Delete worker
   */
  delete: (id) => {
    return apiClient.delete(`${ENDPOINT}/${id}`);
  },

  /**
   * Get worker's DCI score
   */
  getDCI: async (id) => {
    try {
      return await apiClient.get(`${ENDPOINT}/${id}/dci`);
    } catch {
      return await apiClient.get(`/api/api/workers/${id}/dci`);
    }
  },

  /**
   * Get worker's payouts
   */
  getPayouts: async (id, params = {}) => {
    try {
      return await apiClient.get(`${ENDPOINT}/${id}/payouts`, { params });
    } catch {
      return await apiClient.get(`/api/api/workers/${id}/payouts`, { params });
    }
  },

  /**
   * Get worker's fraud flags
   */
  getFraudFlags: async (id) => {
    try {
      return await apiClient.get(`${ENDPOINT}/${id}/fraud-flags`);
    } catch {
      return await apiClient.get(`/api/api/workers/${id}/fraud-flags`);
    }
  },

  /**
   * Get worker's GigScore (derived from multiple factors)
   */
  getGigScore: async (id) => {
    try {
      return await apiClient.get(`${ENDPOINT}/${id}/gig-score`);
    } catch {
      return await apiClient.get(`/api/api/workers/${id}/gig-score`);
    }
  },

  /**
   * Search workers by name or phone
   */
  search: async (query) => {
    try {
      return await apiClient.get(`${ENDPOINT}/search`, { params: { q: query } });
    } catch {
      return await apiClient.get(`/api/api/workers/search`, { params: { q: query } });
    }
  },

  /**
   * Get workers by zone
   */
  getByZone: async (zoneId, params = {}) => {
    try {
      return await apiClient.get(`${ENDPOINT}/zone/${zoneId}`, { params });
    } catch {
      return await apiClient.get(`/api/api/workers/zone/${zoneId}`, { params });
    }
  },

  /**
   * Export workers list
   */
  export: async (format = 'csv') => {
    try {
      return await apiClient.get(`${ENDPOINT}/export`, { params: { format } });
    } catch {
      return await apiClient.get(`/api/api/workers/export`, { params: { format } });
    }
  },
};
