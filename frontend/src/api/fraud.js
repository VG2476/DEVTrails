/**
 * Fraud Detection API Client
 *
 * Maps ONLY to real backend routes mounted in main.py:
 *   POST /api/v1/check-fraud    → Assess a single claim (FraudCheckRequest)
 *   POST /api/v1/fraud/appeal   → Submit an appeal for a blocked payout
 *   GET  /api/v1/fraud/health   → System readiness check for fraud models
 *
 * Removed aspirational stubs (no backend routes exist):
 *   ✗ getAll()          — no GET /fraud list endpoint
 *   ✗ getById()         — no GET /fraud/:id endpoint
 *   ✗ getStats()        — no /fraud/stats endpoint
 *   ✗ getWorkerSignals()— no /fraud/worker/:id endpoint
 *   ✗ detectSyndicate() — no /fraud/syndicate endpoint
 *   ✗ reviewCase()      — no PATCH /fraud/:id/review endpoint
 *   ✗ blacklistWorker() — no /fraud/blacklist endpoint
 *   ✗ removeFromBlacklist() — no DELETE /fraud/blacklist/:id endpoint
 *   ✗ getZoneDensity()  — no /fraud/zones/density endpoint
 *   ✗ getTrends()       — no /fraud/trends endpoint
 *   ✗ exportReport()    — no /fraud/export endpoint
 */
import apiClient from './client.js';

export const fraudAPI = {
  /**
   * Assess a claim through the 3-stage fraud detection pipeline.
   * Returns: { is_fraud, fraud_score, decision, payout_action, explanation, audit_log }
   * POST /api/v1/check-fraud
   */
  checkClaim: (claimData, workerHistory = null, userContext = null) => {
    return apiClient.post('/api/v1/check-fraud', {
      claim: claimData,
      worker_history: workerHistory,
      user_context: userContext,
    });
  },

  /**
   * Appeal a flagged or blocked payout on behalf of a worker.
   * POST /api/v1/fraud/appeal
   */
  appealCase: (id, data) => {
    return apiClient.post(`/api/v1/fraud/${id}/appeal`, data);
  },

  /**
   * Check if the fraud detection models (IF + XGBoost) are loaded and ready.
   * GET /api/v1/fraud/health
   */
  getHealth: () => {
    return apiClient.get('/api/v1/fraud/health');
  },
};
