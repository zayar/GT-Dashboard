import { describe, expect, it } from 'vitest';
import {
  buildTherapistAppointmentsQuery,
  buildTherapistSummaryQuery,
  getTherapistReportPeriod,
} from './therapistReport';

describe('therapist report periods', () => {
  it('uses the selected calendar month instead of a rolling 30-day window', () => {
    const period = getTherapistReportPeriod({
      filterType: 'monthly',
      selectedDate: new Date(2026, 6, 21),
      customStartDate: null,
      customEndDate: null,
    });

    expect(period?.startDate.getFullYear()).toBe(2026);
    expect(period?.startDate.getMonth()).toBe(6);
    expect(period?.startDate.getDate()).toBe(1);
    expect(period?.endDate.getMonth()).toBe(6);
    expect(period?.endDate.getDate()).toBe(31);

    const query = buildTherapistSummaryQuery({ clinicCode: 'gtdenovo', period: period! });
    expect(query).toContain("DATE(CheckInTime) BETWEEN DATE('2026-07-01') AND DATE('2026-07-31')");
  });

  it('filters appointment details by the selected therapist in SQL', () => {
    const period = getTherapistReportPeriod({
      filterType: 'monthly',
      selectedDate: new Date(2026, 6, 21),
      customStartDate: null,
      customEndDate: null,
    });

    const query = buildTherapistAppointmentsQuery({
      clinicCode: 'gtdenovo',
      period: period!,
      therapistName: "Hnin Hnin Win",
    });

    expect(query).toContain("TRIM(PractitionerName) = TRIM('Hnin Hnin Win')");
    expect(query).not.toContain('LIMIT 100');
  });
});
