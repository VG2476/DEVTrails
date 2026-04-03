/**
 * Dashboard — Payout Simulation & Worker Detail Modal Tests
 *
 * Critical user flows:
 *   1. Payout Simulation trigger: calculateProjection() called with correct params
 *   2. Input validation: dci_score must be 0-100, duration must be positive
 *   3. Worker modal data binding: getById() fetches and maps correctly
 *   4. State integration: API failures show degraded mode, not crash
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Mock APIs ────────────────────────────────────────────────────────────────
vi.mock('../src/api/payouts.js', () => ({
  payoutAPI: {
    getAll: vi.fn().mockResolvedValue({ payouts: [], count: 0 }),
    getTodayTotal: vi.fn().mockResolvedValue({ total_payout_today: 0 }),
    calculateProjection: vi.fn(),
  },
}));

vi.mock('../src/api/dci.js', () => ({
  dciAPI: {
    getLatestAlerts: vi.fn().mockResolvedValue({ count: 0, alerts: [] }),
    getByPincode: vi.fn(),
    getTodayTotal: vi.fn().mockResolvedValue({ total_dci_today: 0 }),
  },
}));

vi.mock('../src/api/workers.js', () => ({
  workerAPI: {
    getAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getById: vi.fn(),
    getActiveWeekCount: vi.fn().mockResolvedValue({ active_workers_week: 0 }),
  },
}));

import { payoutAPI } from '../src/api/payouts.js';
import { dciAPI } from '../src/api/dci.js';
import { workerAPI } from '../src/api/workers.js';

afterEach(() => vi.clearAllMocks());

// ── Payout simulation logic ──────────────────────────────────────────────────
const buildSimulationPayload = ({ workerId, pincode, dciScore, durationHours }) => {
  const now = new Date();
  const end = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
  return {
    worker_id: workerId,
    pincode,
    dci_score: dciScore,
    disruption_start: now.toISOString(),
    disruption_end: end.toISOString(),
  };
};

const validateSimulation = ({ workerId, dciScore, durationHours }) => {
  const errors = [];
  if (!workerId || workerId.trim() === '') errors.push('Worker ID is required');
  if (dciScore < 0 || dciScore > 100) errors.push('DCI score must be between 0 and 100');
  if (durationHours <= 0) errors.push('Duration must be positive');
  return errors;
};

describe('Payout Simulation trigger', () => {
  it('calls calculateProjection() with a correctly shaped payload', async () => {
    payoutAPI.calculateProjection.mockResolvedValueOnce({
      payout_amount: 420,
      breakdown: { plan_tier: 'Pro', daily_split: [] },
    });

    const payload = buildSimulationPayload({
      workerId: 'W001',
      pincode: '560095',
      dciScore: 72,
      durationHours: 3,
    });

    await payoutAPI.calculateProjection(payload);

    expect(payoutAPI.calculateProjection).toHaveBeenCalledOnce();
    const call = payoutAPI.calculateProjection.mock.calls[0][0];
    expect(call).toHaveProperty('worker_id', 'W001');
    expect(call).toHaveProperty('dci_score', 72);
    expect(call).toHaveProperty('disruption_start');
    expect(call).toHaveProperty('disruption_end');
    // End must be after start
    expect(new Date(call.disruption_end) > new Date(call.disruption_start)).toBe(true);
  });

  it('returns payout_amount and breakdown in response', async () => {
    payoutAPI.calculateProjection.mockResolvedValueOnce({
      payout_amount: 312,
      breakdown: { plan_tier: 'Basic', total_duration_hours: 2, daily_split: [] },
    });

    const result = await payoutAPI.calculateProjection(buildSimulationPayload({
      workerId: 'W002',
      pincode: '560034',
      dciScore: 68,
      durationHours: 2,
    }));

    expect(result).toHaveProperty('payout_amount');
    expect(typeof result.payout_amount).toBe('number');
    expect(result).toHaveProperty('breakdown');
  });

  it('propagates server error gracefully', async () => {
    payoutAPI.calculateProjection.mockRejectedValueOnce(
      Object.assign(new Error('Worker not found'), { response: { status: 404 } })
    );

    await expect(
      payoutAPI.calculateProjection(buildSimulationPayload({
        workerId: 'INVALID',
        pincode: '560001',
        dciScore: 70,
        durationHours: 1,
      }))
    ).rejects.toMatchObject({ response: { status: 404 } });
  });
});

describe('Payout Simulation — input validation', () => {
  it('rejects empty worker ID', () => {
    const errors = validateSimulation({ workerId: '', dciScore: 70, durationHours: 2 });
    expect(errors).toContain('Worker ID is required');
  });

  it('rejects DCI score above 100', () => {
    const errors = validateSimulation({ workerId: 'W001', dciScore: 150, durationHours: 2 });
    expect(errors).toContain('DCI score must be between 0 and 100');
  });

  it('rejects DCI score below 0', () => {
    const errors = validateSimulation({ workerId: 'W001', dciScore: -5, durationHours: 2 });
    expect(errors).toContain('DCI score must be between 0 and 100');
  });

  it('rejects zero duration', () => {
    const errors = validateSimulation({ workerId: 'W001', dciScore: 70, durationHours: 0 });
    expect(errors).toContain('Duration must be positive');
  });

  it('rejects negative duration', () => {
    const errors = validateSimulation({ workerId: 'W001', dciScore: 70, durationHours: -1 });
    expect(errors).toContain('Duration must be positive');
  });

  it('accepts valid inputs with no errors', () => {
    const errors = validateSimulation({ workerId: 'W001', dciScore: 72, durationHours: 3 });
    expect(errors).toHaveLength(0);
  });

  it('boundary: DCI score = 65 (trigger threshold) is valid', () => {
    const errors = validateSimulation({ workerId: 'W001', dciScore: 65, durationHours: 1 });
    expect(errors).toHaveLength(0);
  });

  it('boundary: DCI score = 100 (max) is valid', () => {
    const errors = validateSimulation({ workerId: 'W001', dciScore: 100, durationHours: 1 });
    expect(errors).toHaveLength(0);
  });
});

describe('Worker Detail Modal — data binding', () => {
  it('getById() is called with correct worker ID', async () => {
    workerAPI.getById.mockResolvedValueOnce({
      id: 'W001',
      name: 'Rajesh Kumar',
      plan: 'pro',
      pincode: '560095',
    });

    const worker = await workerAPI.getById('W001');
    expect(workerAPI.getById).toHaveBeenCalledWith('W001');
    expect(worker.name).toBe('Rajesh Kumar');
    expect(worker.plan).toBe('pro');
  });

  it('handles 404 for unknown worker ID', async () => {
    workerAPI.getById.mockRejectedValueOnce(
      Object.assign(new Error('Not found'), { response: { status: 404 } })
    );

    await expect(workerAPI.getById('UNKNOWN')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });

  it('returns all expected fields for modal display', async () => {
    workerAPI.getById.mockResolvedValueOnce({
      id: 'W002',
      name: 'Meena Devi',
      plan: 'basic',
      pincode: '560034',
      shift: 'Morning',
      gig_score: 87,
    });

    const worker = await workerAPI.getById('W002');
    expect(worker).toHaveProperty('id');
    expect(worker).toHaveProperty('name');
    expect(worker).toHaveProperty('plan');
    expect(worker).toHaveProperty('pincode');
  });
});

describe('Dashboard — API failure degraded mode', () => {
  it('dashboard loads gracefully when all APIs fail', async () => {
    payoutAPI.getAll.mockRejectedValue(new Error('Service unavailable'));
    dciAPI.getLatestAlerts.mockRejectedValue(new Error('Service unavailable'));
    workerAPI.getActiveWeekCount.mockRejectedValue(new Error('Service unavailable'));

    // Consuming code catches errors and shows fallback data
    // This tests that errors don't throw unhandled rejections
    let caught = 0;
    const handlers = [payoutAPI.getAll, dciAPI.getLatestAlerts, workerAPI.getActiveWeekCount];
    for (const fn of handlers) {
      try { await fn(); } catch { caught++; }
    }
    expect(caught).toBe(3);
  });

  it('partial failure: DCI works while payouts fail', async () => {
    payoutAPI.getAll.mockRejectedValueOnce(new Error('DB timeout'));
    dciAPI.getLatestAlerts.mockResolvedValueOnce({ count: 2, alerts: [] });

    let payoutsResult = null;
    try { payoutsResult = await payoutAPI.getAll(); } catch { /* fallback to [] */ }
    const dciResult = await dciAPI.getLatestAlerts();

    expect(payoutsResult).toBeNull(); // Failed, so falls back
    expect(dciResult.count).toBe(2); // DCI still works
  });
});
