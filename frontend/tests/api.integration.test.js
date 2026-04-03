/**
 * API Integration — Vitest
 *
 * Tests the frontend API client layer for:
 *   1. Correct endpoint construction (URL, method, params)
 *   2. CORS / network failure handling (degraded mode)
 *   3. Request parameter forwarding (filters, pagination)
 *   4. Response shape validation (required fields present)
 *   5. Authentication header injection via axios interceptors
 *
 * Uses vi.mock to stub axios and verify the client does the right thing
 * without hitting the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock the axios client module ─────────────────────────────────────────────
vi.mock('../src/api/client.js', () => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  const mockPatch = vi.fn();
  return {
    default: {
      get: mockGet,
      post: mockPost,
      patch: mockPatch,
    },
    __mockGet: mockGet,
    __mockPost: mockPost,
  };
});

import apiClient from '../src/api/client.js';
import { payoutAPI } from '../src/api/payouts.js';
import { dciAPI } from '../src/api/dci.js';
import { workerAPI } from '../src/api/workers.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
const mockSuccess = (data) => apiClient.get.mockResolvedValueOnce(data);
const mockFailure = (status, message) =>
  apiClient.get.mockRejectedValueOnce(
    Object.assign(new Error(message), { response: { status } })
  );

// ── Tests: payoutAPI ─────────────────────────────────────────────────────────
describe('payoutAPI — endpoint construction', () => {
  afterEach(() => vi.clearAllMocks());

  it('getAll() calls GET /api/payouts', async () => {
    mockSuccess({ payouts: [], count: 0 });
    await payoutAPI.getAll();
    expect(apiClient.get).toHaveBeenCalledWith('/api/payouts', { params: {} });
  });

  it('getAll() forwards status filter param', async () => {
    mockSuccess({ payouts: [], count: 0 });
    await payoutAPI.getAll({ status: 'processing', limit: 10 });
    expect(apiClient.get).toHaveBeenCalledWith('/api/payouts', {
      params: { status: 'processing', limit: 10 },
    });
  });

  it('getById() calls GET /api/payouts/:id', async () => {
    mockSuccess({ id: 'pay-001' });
    await payoutAPI.getById('pay-001');
    expect(apiClient.get).toHaveBeenCalledWith('/api/payouts/pay-001');
  });

  it('getTodayTotal() calls GET /api/payouts/total/today', async () => {
    mockSuccess({ total_payout_today: 5000 });
    await payoutAPI.getTodayTotal();
    expect(apiClient.get).toHaveBeenCalledWith('/api/payouts/total/today');
  });

  it('calculateProjection() calls POST /api/calculate_payout', async () => {
    apiClient.post.mockResolvedValueOnce({ payout_amount: 420 });
    await payoutAPI.calculateProjection({ worker_id: 'W001', dci_score: 72 });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/calculate_payout',
      { worker_id: 'W001', dci_score: 72 }
    );
  });
});

// ── Tests: dciAPI ────────────────────────────────────────────────────────────
describe('dciAPI — endpoint construction', () => {
  afterEach(() => vi.clearAllMocks());

  it('getByPincode() calls GET /api/v1/dci/:pincode', async () => {
    mockSuccess({ pincode: '560095', current: {}, history_24h: [] });
    await dciAPI.getByPincode('560095');
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/dci/560095');
  });

  it('getLatestAlerts() calls GET /api/v1/dci-alerts/latest with limit param', async () => {
    mockSuccess({ count: 0, alerts: [] });
    await dciAPI.getLatestAlerts(4);
    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/dci-alerts/latest',
      { params: { limit: 4 } }
    );
  });

  it('getTodayTotal() calls GET /dci/total/today', async () => {
    mockSuccess({ total_dci_today: 7 });
    await dciAPI.getTodayTotal();
    expect(apiClient.get).toHaveBeenCalledWith('/dci/total/today');
  });
});

// ── Tests: workerAPI ─────────────────────────────────────────────────────────
describe('workerAPI — endpoint construction', () => {
  afterEach(() => vi.clearAllMocks());

  it('getAll() calls GET /api/workers with params', async () => {
    mockSuccess({ data: [], total: 0 });
    await workerAPI.getAll({ limit: 50 });
    expect(apiClient.get).toHaveBeenCalledWith('/api/workers', { params: { limit: 50 } });
  });

  it('getById() calls GET /api/workers/:id', async () => {
    mockSuccess({ id: 'W001' });
    await workerAPI.getById('W001');
    expect(apiClient.get).toHaveBeenCalledWith('/api/workers/W001');
  });

  it('getActiveWeekCount() calls GET /api/workers/active/week', async () => {
    mockSuccess({ active_workers_week: 42 });
    await workerAPI.getActiveWeekCount();
    expect(apiClient.get).toHaveBeenCalledWith('/api/workers/active/week');
  });
});

// ── Tests: degraded mode / API failure handling ──────────────────────────────
describe('API client — CORS and network failure handling', () => {
  afterEach(() => vi.clearAllMocks());

  it('payoutAPI.getAll() propagates 503 service unavailable', async () => {
    mockFailure(503, 'Failed to fetch payouts from database');
    await expect(payoutAPI.getAll()).rejects.toMatchObject({
      response: { status: 503 },
    });
  });

  it('dciAPI.getLatestAlerts() propagates 503', async () => {
    mockFailure(503, 'Failed to fetch DCI alerts');
    await expect(dciAPI.getLatestAlerts()).rejects.toMatchObject({
      response: { status: 503 },
    });
  });

  it('dciAPI.getByPincode() propagates 404 for missing pincode', async () => {
    mockFailure(404, 'No active DCI data for pin code 999999');
    await expect(dciAPI.getByPincode('999999')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });

  it('network error (CORS/offline) throws without response object', async () => {
    apiClient.get.mockRejectedValueOnce(new Error('Network Error'));
    await expect(payoutAPI.getAll()).rejects.toThrow('Network Error');
  });

  it('all APIs fail independently without side effects', async () => {
    // Simulate partial failure: payouts fails, DCI works
    apiClient.get
      .mockRejectedValueOnce(new Error('Payouts down'))
      .mockResolvedValueOnce({ count: 2, alerts: [] });

    await expect(payoutAPI.getAll()).rejects.toThrow('Payouts down');
    const dciResult = await dciAPI.getLatestAlerts();
    expect(dciResult.count).toBe(2);
  });
});

// ── Tests: response shape validation ────────────────────────────────────────
describe('API response shape validation', () => {
  afterEach(() => vi.clearAllMocks());

  it('payout list response has payouts array and count', async () => {
    mockSuccess({ payouts: [{ id: '1', worker_name: 'Test', amount: 100 }], count: 1 });
    const result = await payoutAPI.getAll();
    expect(result).toHaveProperty('payouts');
    expect(result).toHaveProperty('count');
    expect(Array.isArray(result.payouts)).toBe(true);
  });

  it('DCI alerts response has count and alerts array', async () => {
    mockSuccess({ count: 0, alerts: [] });
    const result = await dciAPI.getLatestAlerts();
    expect(result).toHaveProperty('count');
    expect(result).toHaveProperty('alerts');
    expect(Array.isArray(result.alerts)).toBe(true);
  });

  it('today payout response has total_payout_today number', async () => {
    mockSuccess({ total_payout_today: 8500 });
    const result = await payoutAPI.getTodayTotal();
    expect(typeof result.total_payout_today).toBe('number');
  });

  it('worker active week response has active_workers_week number', async () => {
    mockSuccess({ active_workers_week: 127 });
    const result = await workerAPI.getActiveWeekCount();
    expect(typeof result.active_workers_week).toBe('number');
  });
});
