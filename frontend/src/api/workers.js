/**
 * Worker API Client
 * 
 * Maps 1:1 to live backend routes with a mix of root and /api prefixes.
 */
import apiClient from './client.js';

export const workerAPI = {
  /**
   * Get all workers with pagination and filters.
   * GET /api/workers
   */
  getAll: (params = {}) => {
    return apiClient.get('/api/workers', { params });
  },

  /**
   * Get single worker by ID with full profile details.
   * GET /api/workers/:id
   */
  getById: (id) => {
    return apiClient.get(`/api/workers/${id}`);
  },

  /**
   * Get the total count of workers with an active policy this calendar week.
   * GET /api/workers/active/week (Note: mounted with /api prefix)
   */
  getActiveWeekCount: () => {
    return apiClient.get('/api/workers/active/week');
  },
};
