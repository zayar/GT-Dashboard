import { describe, expect, it } from 'vitest';
import {
  buildCheckInOutOrderCancelClause,
  buildCheckInOutRecordsQuery,
  buildCheckInOutStatusClause,
  DEFAULT_CHECK_IN_OUT_STATUS_FILTER,
  MERCHANT_CANCEL_STATUS,
  ORDER_CANCEL_STATUS,
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

  it('excludes canceled orders by default', () => {
    const query = buildCheckInOutRecordsQuery({
      startDate: '2026-06-14 00:00:00',
      endDate: '2026-06-14 23:59:59',
      clinicCode: 'GTCHI',
      statusFilter: DEFAULT_CHECK_IN_OUT_STATUS_FILTER,
    });

    expect(query).toContain('NOT EXISTS');
    expect(query).toContain('FROM orders order_status');
    expect(query).toContain('order_status.order_id = v.OrderId');
    expect(query).toContain('order_status.clinic_id = v.ClinicId');
    expect(query).toContain("LOWER(TRIM(order_status.status)) = 'cancel'");
  });

  it('removes payment and order status filters when all statuses are selected', () => {
    expect(buildCheckInOutStatusClause('all')).toBe('');
  });

  it('can explicitly filter to merchant-cancelled records', () => {
    expect(buildCheckInOutStatusClause(MERCHANT_CANCEL_STATUS)).toBe(
      " AND LOWER(TRIM(v.PaymentStatus)) = LOWER('Merchant Cancel')"
    );
  });

  it('keeps canceled orders out of normal payment-status filters', () => {
    const clause = buildCheckInOutStatusClause('PAID');

    expect(clause).toContain("LOWER(TRIM(v.PaymentStatus)) = LOWER('PAID')");
    expect(clause).toContain('NOT EXISTS');
    expect(clause).toContain('FROM orders order_status');
  });

  it('can explicitly filter to canceled orders', () => {
    const clause = buildCheckInOutStatusClause(ORDER_CANCEL_STATUS);

    expect(clause).toContain('EXISTS');
    expect(clause).not.toContain('NOT EXISTS');
    expect(clause).toContain("LOWER(TRIM(order_status.status)) = 'cancel'");
  });

  it('builds the reusable canceled-order exclusion clause', () => {
    expect(buildCheckInOutOrderCancelClause()).toContain('NOT EXISTS');
  });
});
