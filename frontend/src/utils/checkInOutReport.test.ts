import { describe, expect, it } from 'vitest';
import {
  buildCheckInOutRecordsQuery,
  buildCheckInOutStatusClause,
  DEFAULT_CHECK_IN_OUT_STATUS_FILTER,
  MERCHANT_CANCEL_STATUS,
} from './checkInOutReport';

describe('buildCheckInOutRecordsQuery', () => {
  it('filters the report date by check-in time', () => {
    const query = buildCheckInOutRecordsQuery({
      startDate: '2026-06-25 00:00:00',
      endDate: '2026-06-25 23:59:59',
      clinicCode: 'GTDRKO',
      statusFilter: DEFAULT_CHECK_IN_OUT_STATUS_FILTER,
    });

    expect(query).toContain("v.CheckInTime >= '2026-06-25 00:00:00'");
    expect(query).toContain("v.CheckInTime <= '2026-06-25 23:59:59'");
    expect(query).not.toContain('v.CheckOutTime >=');
    expect(query).not.toContain('v.CheckOutTime <=');
  });

  it('excludes merchant-cancelled records by default', () => {
    const query = buildCheckInOutRecordsQuery({
      startDate: '2026-06-25 00:00:00',
      endDate: '2026-06-25 23:59:59',
      clinicCode: 'GTDRKO',
      statusFilter: DEFAULT_CHECK_IN_OUT_STATUS_FILTER,
    });

    expect(query).toContain("v.PaymentStatus IS NULL OR LOWER(TRIM(v.PaymentStatus)) != LOWER('Merchant Cancel')");
  });

  it('removes the status filter when all statuses are selected', () => {
    expect(buildCheckInOutStatusClause('all')).toBe('');
  });

  it('can explicitly filter to merchant-cancelled records', () => {
    expect(buildCheckInOutStatusClause(MERCHANT_CANCEL_STATUS)).toBe(
      " AND LOWER(TRIM(v.PaymentStatus)) = LOWER('Merchant Cancel')"
    );
  });
});
