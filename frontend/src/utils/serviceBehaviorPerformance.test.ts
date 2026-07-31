import { describe, expect, it } from 'vitest';
import {
  buildMonthlyBookingTotalsQuery,
  buildPractitionerServicePerformanceQuery,
  buildServicePerformanceQuery,
  sortPerformanceRows,
} from './serviceBehaviorPerformance';

const params = {
  clinicCode: "clinic'o",
  clinicId: 'clinic-id',
  period: 'monthly' as const,
  selectedYear: 2026,
};

describe('service behavior performance queries', () => {
  it('counts distinct valid bookings and excludes booking deposits', () => {
    const query = buildMonthlyBookingTotalsQuery(params);

    expect(query).toContain('COUNT(DISTINCT booking_key)');
    expect(query).toContain("UPPER(IFNULL(checkins.status, '')) != 'CANCEL'");
    expect(query).toContain("('booking deposit', 'booking deposits', 'deposit')");
    expect(query).toContain("LOWER(ClinicCode) = LOWER('clinic''o')");
    expect(query).toContain("BETWEEN DATE('2026-01-01') AND DATE('2026-12-31')");
  });

  it('allocates the final paid order amount to unique service items', () => {
    const query = buildServicePerformanceQuery(params);

    expect(query).toContain("UPPER(IFNULL(orders.status, '')) IN ('ACTIVE', 'DONE')");
    expect(query).toContain("UPPER(IFNULL(orders.payment_status, '')) = 'PAID'");
    expect(query).toContain("UPPER(IFNULL(orders.payment_method, '')) != 'PASS'");
    expect(query).toContain('orders.net_total');
    expect(query).toContain('SAFE_DIVIDE(allocated_items.item_total, allocated_items.order_item_total)');
    expect(query).toContain('order_items.id AS order_item_id');
    expect(query).toContain('FULL OUTER JOIN SalesPerformance');
  });

  it('attributes sales through non-cancelled practitioner treatment links', () => {
    const query = buildPractitionerServicePerformanceQuery(params);

    expect(query).toContain('PractitionerLinks AS');
    expect(query).toContain('links.order_pk = sales.order_pk');
    expect(query).toContain('links.service_id = sales.service_id');
    expect(query).toContain('SAFE_DIVIDE(sales.total_sales, link_counts.practitioner_count)');
    expect(query).not.toContain('LIMIT 100');
  });

  it('uses a three-year range for annual mode', () => {
    const query = buildServicePerformanceQuery({ ...params, period: 'annual' });

    expect(query).toContain("BETWEEN DATE('2024-01-01') AND DATE('2026-12-31')");
    expect(query).toContain('EXTRACT(YEAR FROM activity_date)');
  });
});

describe('performance ranking sorting', () => {
  const rows = [
    { label: 'Beta', bookings: 12, totalSales: 500 },
    { label: 'Alpha', bookings: 8, totalSales: 900 },
    { label: 'Gamma', bookings: 12, totalSales: 500 },
  ];

  it('re-ranks by bookings or sales in either direction', () => {
    expect(sortPerformanceRows(rows, 'bookings', 'desc', row => row.label).map(row => row.label))
      .toEqual(['Beta', 'Gamma', 'Alpha']);
    expect(sortPerformanceRows(rows, 'sales', 'desc', row => row.label).map(row => row.label))
      .toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(sortPerformanceRows(rows, 'sales', 'asc', row => row.label).map(row => row.label))
      .toEqual(['Beta', 'Gamma', 'Alpha']);
  });
});
