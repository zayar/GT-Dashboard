import { describe, expect, it } from 'vitest';
import {
  formatCustomerDateTime,
  formatCustomerEventDate,
  formatProcedureDateTime,
} from './customer360Formatting';

describe('Customer 360 Yangon date formatting', () => {
  it('converts a UTC booking instant to Yangon time with a readable month', () => {
    expect(formatCustomerEventDate('2026-06-24T19:30:00.000Z')).toEqual({
      day: '25',
      month: 'Jun',
      time: '2:00 AM',
    });
    expect(formatCustomerDateTime('2026-06-24T19:30:00.000Z'))
      .toBe('25 Jun 2026, 2:00 AM (Yangon)');
    expect(formatProcedureDateTime('2026-06-24T19:30:00.000Z'))
      .toBe('Thu, 25 June 2026 · 2:00 AM Yangon time');
  });

  it('does not expose invalid or missing raw timestamps', () => {
    expect(formatCustomerDateTime('not-a-date')).toBe('Date not recorded');
    expect(formatProcedureDateTime(undefined)).toBe('Procedure time not recorded');
  });
});
