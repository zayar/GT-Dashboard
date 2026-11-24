import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCanonicalMetricPeriodRanges } from './canonicalSalesMetrics';
import { loadDashboardActivity } from './dashboardActivity';

const ranges = resolveCanonicalMetricPeriodRanges('monthly', new Date(2026, 10, 24));
const signal = new AbortController().signal;
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dashboard operational activity', () => {
  it('reads both comparable date windows in one clinic-scoped warehouse request', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ success: true, data: [
      { period: 'current', customers: 8, appointments: 10, services: 4 },
    ] }));
    vi.stubGlobal('fetch', fetch);
    const result = await loadDashboardActivity('Clinic A', ranges, signal);
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0][1];
    expect(request.signal).toBe(signal);
    const { query } = JSON.parse(request.body);
    expect(query).toContain("LOWER(ClinicCode) = LOWER('Clinic A')");
    expect(query).toContain("BETWEEN DATE('2026-11-01') AND DATE('2026-11-24')");
    expect(query).toContain("BETWEEN DATE('2026-10-01') AND DATE('2026-10-24')");
    expect(result.current).toEqual({ customers: 8, appointmentsPerCustomer: 1.25, services: 4 });
    expect(result.previous).toEqual({ customers: 0, appointmentsPerCustomer: 0, services: 0 });
  });

  it('distinguishes a failed query from a period with no activity', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: false, error: 'Warehouse offline' })));
    await expect(loadDashboardActivity('Clinic A', ranges, signal)).rejects.toThrow('Warehouse offline');
  });
});
