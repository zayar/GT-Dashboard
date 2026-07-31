import { describe, expect, it } from 'vitest';
import {
  buildTopTreatmentPerformanceQuery,
  buildTreatmentDetailsQuery,
  buildTreatmentFilterOptionsQuery,
} from './treatmentPerformance';

const queryParams = {
  clinicCode: 'gtdenovo',
  clinicId: 'clinic-id',
  startDate: '2025-01-01',
  endDate: '2026-12-31',
};

describe('treatment performance queries', () => {
  it('uses shared lifecycle rules and clinic-local dates', () => {
    const query = buildTreatmentDetailsQuery(queryParams);

    expect(query).toContain("DATETIME(TIMESTAMP(o.created_at), 'Asia/Yangon')");
    expect(query).toContain('CheckInPractitionerLinks AS');
    expect(query).toContain('FROM `great_time.checkin` checkins');
    expect(query).toContain('checkin_practitioners.practitioner_name');
    expect(query).toContain("STARTS_WITH(UPPER(order_number), 'CO-')");
    expect(query).toContain("LOWER(service_name) != 'booking deposit'");
    expect(query).toContain("COUNT(DISTINCT IF(activity_type = 'TREATMENT_RETURN', order_pk, NULL))");
    expect(query).toContain("EXTRACT(MONTH FROM activity_datetime)");
  });

  it('applies category and practitioner filters at activity grain', () => {
    const query = buildTreatmentDetailsQuery({
      ...queryParams,
      category: "Injectable's",
      practitioner: 'Dr Zaw',
      services: ['Laser', "Doctor's Consultation", 'Laser', '  '],
    });

    expect(query).toContain("LOWER(service_category) = LOWER('Injectable''s')");
    expect(query).toContain("LOWER(practitioner_name) = LOWER('Dr Zaw')");
    expect(query).toContain(
      "LOWER(service_name) IN (LOWER('Laser'), LOWER('Doctor''s Consultation'))",
    );
  });

  it('keeps the top report on the same shared activity CTEs', () => {
    const query = buildTopTreatmentPerformanceQuery(queryParams);

    expect(query).toContain('ServiceCategories AS');
    expect(query).toContain('ClassifiedActivity AS');
    expect(query).toContain('HAVING totalActivity > 0');
  });

  it('builds clinic-scoped filter options', () => {
    const query = buildTreatmentFilterOptionsQuery("clinic'id");

    expect(query).toContain("categories.clinic_id = 'clinic''id'");
    expect(query).toContain("practitioners.clinic_id = 'clinic''id'");
    expect(query).toContain("SELECT 'practitioner', 'Unassigned'");
    expect(query).toContain("services.clinic_id = 'clinic''id'");
    expect(query).toContain("'service' AS optionType");
    expect(query).toContain("packages.clinic_id = 'clinic''id'");
  });
});
