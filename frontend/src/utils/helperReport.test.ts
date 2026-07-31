import { describe, expect, it } from 'vitest';
import {
  buildHelperAppointmentsQuery,
  buildHelperSummaryQuery,
  getHelperReportPeriod,
} from './helperReport';

describe('helper report filters', () => {
  it('uses the selected Monday-to-Sunday calendar week', () => {
    const period = getHelperReportPeriod({
      filterType: 'weekly',
      selectedDate: new Date(2026, 6, 21),
      customStartDate: null,
      customEndDate: null,
    });

    const query = buildHelperSummaryQuery({ clinicCode: 'gtdenovo', period: period! });
    expect(query).toContain("DATE(CheckInTime) BETWEEN DATE('2026-07-20') AND DATE('2026-07-26')");
  });

  it('uses the selected full calendar month', () => {
    const period = getHelperReportPeriod({
      filterType: 'monthly',
      selectedDate: new Date(2026, 6, 21),
      customStartDate: null,
      customEndDate: null,
    });

    const query = buildHelperSummaryQuery({ clinicCode: 'gtdenovo', period: period! });
    expect(query).toContain("DATE(CheckInTime) BETWEEN DATE('2026-07-01') AND DATE('2026-07-31')");
  });

  it('filters appointment details by the selected helper in SQL', () => {
    const period = getHelperReportPeriod({
      filterType: 'monthly',
      selectedDate: new Date(2026, 6, 21),
      customStartDate: null,
      customEndDate: null,
    });

    const query = buildHelperAppointmentsQuery({
      clinicCode: 'gtdenovo',
      period: period!,
      helperName: 'Thiri Zaw',
    });

    expect(query).toContain("TRIM(HelperName) = TRIM('Thiri Zaw')");
    expect(query).not.toContain('LIMIT 100');
  });
});
