import { describe, expect, it } from 'vitest';
import {
  buildCheckInOutOrderCancelClause,
  buildCheckInOutRecordsQuery,
  buildCheckInOutStatusClause,
  DEFAULT_CHECK_IN_OUT_STATUS_FILTER,
  formatReportDateTime,
  getCheckInOutDateRangeBounds,
  MERCHANT_CANCEL_STATUS,
  ORDER_CANCEL_STATUS,
} from './checkInOutReport';

describe('buildCheckInOutRecordsQuery', () => {
  it('filters custom date ranges by check-in time by default', () => {
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

  it('can filter report date ranges by check-out time', () => {
    const query = buildCheckInOutRecordsQuery({
      startDate: '2026-06-14 00:00:00',
      endDate: '2026-06-14 23:59:59',
      clinicCode: 'GTFANCYHOUSEGA',
      statusFilter: DEFAULT_CHECK_IN_OUT_STATUS_FILTER,
      dateFilterField: 'checkOut',
    });

    expect(query).toContain("v.CheckOutTime >= '2026-06-14 00:00:00'");
    expect(query).toContain("v.CheckOutTime <= '2026-06-14 23:59:59'");
    expect(query).not.toContain('v.CheckInTime >=');
    expect(query).not.toContain('v.CheckInTime <=');
    expect(query).toContain('ORDER BY v.CheckOutTime DESC, v.CheckInTime DESC');
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

describe('formatReportDateTime', () => {
  it('displays serialized report timestamps without shifting them as UTC', () => {
    expect(formatReportDateTime('2026-06-14T18:03:34.807Z')).toBe('2026-06-14 06:03 PM');
  });

  it('keeps late-night report timestamps on the stored report date', () => {
    expect(formatReportDateTime('2026-06-15T19:50:00.000Z')).toBe('2026-06-15 07:50 PM');
  });

  it('supports raw SQL datetime strings', () => {
    expect(formatReportDateTime('2026-06-14 17:54:00')).toBe('2026-06-14 05:54 PM');
  });
});
