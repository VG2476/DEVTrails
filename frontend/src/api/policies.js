/**
 * Policy API Client
 *
 * Maps ONLY to real backend routes in api/policies.py (prefix: /api/v1):
 *   GET   /api/v1/policy/:id   → Fetch policy details by policy ID
 *   PATCH /api/v1/policy/:id   → Update plan, shift, or pin_codes
 *
 * Derived endpoint (worker-scoped):
 *   GET   /api/v1/worker/:workerId/policy → Active policy for a worker
 *                                           (via worker_detail.py response shape)
 *
 * Removed aspirational stubs (no backend routes exist):
 *   ✗ getAll()            — no GET /policies list endpoint
 *   ✗ create()            — policy creation is via POST /api/v1/register (onboarding only)
 *   ✗ delete()            — no DELETE /policies/:id endpoint
 *   ✗ getTiers()          — no /policies/tiers endpoint
 *   ✗ getCoverageDetails()— no /policies/:id/coverage endpoint
 *   ✗ cloneForWorker()    — no /policies/:id/clone endpoint
 */
import apiClient from './client.js';

const ENDPOINT = '/api/v1/policy';

export const policyAPI = {
  /**
   * Fetch full policy details by policy ID.
   * GET /api/v1/policy/:id
   */
  getById: (id) => {
    return apiClient.get(`${ENDPOINT}/${id}`);
  },

  /**
   * Update policy fields. Business rules enforced on the server:
   *   - plan changes → queued for next Monday
   *   - shift/pin_codes → immediate effect
   *
   * PATCH /api/v1/policy/:id
   */
  update: (id, data) => {
    return apiClient.patch(`${ENDPOINT}/${id}`, data);
  },

  /**
   * Fetch the active policy for a specific worker.
   * The backend returns this as part of the worker detail response.
   * GET /api/v1/workers/:workerId  (policy is nested in the response)
   *
   * Note: Use workerAPI.getById(workerId) and access .data.policy
   * This helper is a convenience wrapper for direct policy-only access.
   * GET /api/v1/worker/:workerId/policy
   */
  getWorkerPolicy: (workerId) => {
    return apiClient.get(`/api/v1/worker/${workerId}/policy`);
  },
};
