import { describe, expect, it } from 'vitest';
import {
  formatAppointmentDateTime,
  formatGraphqlDateTimeInMyanmar,
  formatReportDateTime,
  getCheckInOutDateRangeBounds,
} from './checkInOutReport';

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

describe('report date formatting', () => {
  it('keeps appointment-view wall-clock timestamps on their stored date', () => {
    expect(formatReportDateTime('2026-06-14T18:03:34.807Z')).toBe('2026-06-14 06:03 PM');
    expect(formatAppointmentDateTime('2026-07-22T16:30:00.000Z')).toBe('Jul 22, 4:30 PM');
  });

  it('converts live APICORE timestamps to Myanmar time', () => {
    expect(formatGraphqlDateTimeInMyanmar('2026-06-14T18:03:34.807Z')).toBe(
      '2026-06-15 12:33 AM',
    );
  });

  it('returns a placeholder for missing or invalid APICORE timestamps', () => {
    expect(formatGraphqlDateTimeInMyanmar(null)).toBe('-');
    expect(formatGraphqlDateTimeInMyanmar('not-a-date')).toBe('-');
  });
});
