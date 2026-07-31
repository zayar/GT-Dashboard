import { describe, expect, it } from 'vitest';
import {
  buildCustomerServiceActivityQuery,
  getCustomerServiceActivityRange,
} from './customerServiceActivity';

describe('customer service activity ranges', () => {
  it('uses Monday through Sunday for weekly reporting', () => {
    const range = getCustomerServiceActivityRange({
      period: 'week',
      anchorDate: new Date(2026, 6, 22),
    });

    expect(range.startDateKey).toBe('2026-07-20');
    expect(range.endDateKey).toBe('2026-07-26');
    expect(range.label).toBe('Jul 20, 2026 – Jul 26, 2026');
  });

  it('uses the complete selected calendar month', () => {
    const range = getCustomerServiceActivityRange({
      period: 'month',
      anchorDate: new Date(2024, 1, 14),
    });

    expect(range.startDateKey).toBe('2024-02-01');
    expect(range.endDateKey).toBe('2024-02-29');
    expect(range.label).toBe('February 2024');
  });

  it('keeps an inclusive custom range and rejects reversed dates', () => {
    const range = getCustomerServiceActivityRange({
      period: 'custom',
      customStartDate: new Date(2026, 5, 10),
      customEndDate: new Date(2026, 6, 22),
    });

    expect(range.startDateKey).toBe('2026-06-10');
    expect(range.endDateKey).toBe('2026-07-22');
    expect(() => getCustomerServiceActivityRange({
      period: 'custom',
      customStartDate: new Date(2026, 6, 23),
      customEndDate: new Date(2026, 6, 22),
    })).toThrow('Start date must be on or before end date.');
  });
});

describe('customer service activity query', () => {
  it('applies one inclusive range to visits, payments, and new-customer classification', () => {
    const query = buildCustomerServiceActivityQuery({
      clinicCode: "clinic'one",
      startDate: '2026-07-20',
      endDate: '2026-07-26',
    });

    expect(query).toContain("DATE(CheckInTime) BETWEEN DATE('2026-07-20') AND DATE('2026-07-26')");
    expect(query).toContain("DATE(OrderCreatedDate) BETWEEN DATE('2026-07-20') AND DATE('2026-07-26')");
    expect(query).toContain("first_visits.first_visit_date BETWEEN DATE('2026-07-20') AND DATE('2026-07-26')");
    expect(query).toContain("LOWER('clinic''one')");
  });

  it('deduplicates invoices and safely falls back to the order id', () => {
    const query = buildCustomerServiceActivityQuery({
      clinicCode: 'gtdenovo',
      startDate: '2026-07-22',
      endDate: '2026-07-22',
    });

    expect(query).toContain("CONCAT('ORDER:', CAST(OrderId AS STRING))");
    expect(query).toContain('GROUP BY CustomerPhoneNumber, InvoiceKey');
    expect(query).toContain('SUM(InvoiceNetTotal) AS TotalPaymentAmount');
  });
});
