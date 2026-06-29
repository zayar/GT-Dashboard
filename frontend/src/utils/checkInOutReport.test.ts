import { describe, expect, it } from 'vitest';
import {
  buildCheckInOutOrderCancelClause,
  buildCheckInOutRecordsQuery,
  buildCheckInOutStatusClause,
  DEFAULT_CHECK_IN_OUT_STATUS_FILTER,
  getCheckInOutDateRangeBounds,
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

describe('getCheckInOutDateRangeBounds', () => {
  it('uses the full selected day for day mode', () => {
    const bounds = getCheckInOutDateRangeBounds({
      dateRange: 'day',
      reportDate: new Date(2026, 5, 15, 14, 30),
      customStartDate: null,
      customEndDate: null,
    });

    expect(bounds?.startDate.getFullYear()).toBe(2026);
    expect(bounds?.startDate.getMonth()).toBe(5);
    expect(bounds?.startDate.getDate()).toBe(15);
    expect(bounds?.startDate.getHours()).toBe(0);
    expect(bounds?.startDate.getMinutes()).toBe(0);
    expect(bounds?.endDate.getDate()).toBe(15);
    expect(bounds?.endDate.getHours()).toBe(23);
    expect(bounds?.endDate.getMinutes()).toBe(59);
  });

  it('uses from start-of-day through to end-of-day for custom mode', () => {
    const bounds = getCheckInOutDateRangeBounds({
      dateRange: 'custom',
      reportDate: null,
      customStartDate: new Date(2026, 5, 10, 14, 30),
      customEndDate: new Date(2026, 5, 15, 8, 5),
    });

    expect(bounds?.startDate.getDate()).toBe(10);
    expect(bounds?.startDate.getHours()).toBe(0);
    expect(bounds?.startDate.getMinutes()).toBe(0);
    expect(bounds?.endDate.getDate()).toBe(15);
    expect(bounds?.endDate.getHours()).toBe(23);
    expect(bounds?.endDate.getMinutes()).toBe(59);
  });

  it('rejects custom ranges where from date is after to date', () => {
    const bounds = getCheckInOutDateRangeBounds({
      dateRange: 'custom',
      reportDate: null,
      customStartDate: new Date(2026, 5, 16),
      customEndDate: new Date(2026, 5, 15),
    });

    expect(bounds).toBeNull();
  });
});
