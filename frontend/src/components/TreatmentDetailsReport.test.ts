import { describe, expect, it } from 'vitest';
import { buildTreatmentMatrix, getTreatmentPeriodMetrics, getTreatmentYearTotal } from './TreatmentDetailsReport';

describe('Treatment Details Report matrix', () => {
  const matrix = buildTreatmentMatrix([
    { serviceName: 'Shaving Charges', serviceCategory: 'Face', activityYear: 2025, activityMonth: 1, treatmentReturns: 2, newPurchases: 5 },
    { serviceName: 'Shaving Charges', serviceCategory: 'Face', activityYear: 2025, activityMonth: 2, treatmentReturns: 3, newPurchases: 4 },
    { serviceName: 'Aesthetic Consultation Fees', serviceCategory: 'Consultation', activityYear: 2025, activityMonth: 1, treatmentReturns: 1, newPurchases: 2 },
  ]);

  it('keeps every service as a vertical matrix row', () => {
    expect(matrix.map(row => row.serviceName)).toEqual([
      'Aesthetic Consultation Fees',
      'Shaving Charges',
    ]);
  });

  it('uses returns plus purchases for monthly total activity', () => {
    expect(getTreatmentPeriodMetrics(matrix[1], '2025-01', 'monthly')).toEqual({
      treatmentReturns: 2,
      newPurchases: 5,
      totalActivity: 7,
    });
  });

  it('aggregates monthly activity into yearly overview values', () => {
    expect(getTreatmentPeriodMetrics(matrix[1], '2025', 'yearly')).toEqual({
      treatmentReturns: 5,
      newPurchases: 9,
      totalActivity: 14,
    });
  });

  it('calculates the sortable monthly-view total across January to December', () => {
    expect(getTreatmentYearTotal(matrix[1], 2025)).toBe(14);
  });
});
