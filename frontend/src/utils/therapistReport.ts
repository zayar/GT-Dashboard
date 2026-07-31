import {
  buildStaffDateCondition,
  getStaffReportPeriod,
  StaffFilterType,
  StaffReportPeriod,
} from './staffReportPeriod';

export type TherapistFilterType = StaffFilterType;
export type TherapistReportPeriod = StaffReportPeriod;
export const getTherapistReportPeriod = getStaffReportPeriod;

interface TherapistQueryOptions {
  clinicCode: string;
  period: TherapistReportPeriod;
}

interface TherapistAppointmentsQueryOptions extends TherapistQueryOptions {
  therapistName?: string | null;
}

const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''");

export const buildTherapistDateCondition = (period: TherapistReportPeriod): string => {
  return buildStaffDateCondition(period);
};

export const buildTherapistSummaryQuery = ({
  clinicCode,
  period,
}: TherapistQueryOptions): string => `
  SELECT
    PractitionerName AS name,
    ARRAY_AGG(
      NULLIF(PractitionerImage, '')
      IGNORE NULLS
      ORDER BY CheckInTime DESC
      LIMIT 1
    )[SAFE_OFFSET(0)] AS image,
    COUNT(*) AS bookingCount
  FROM \`great_time.MainDataView\`
  WHERE PractitionerName IS NOT NULL
    AND PractitionerName != 'N/A'
    AND TRIM(PractitionerName) != ''
    AND LOWER(ClinicCode) = LOWER('${escapeSqlLiteral(clinicCode)}')
    AND ${buildTherapistDateCondition(period)}
  GROUP BY PractitionerName
  ORDER BY bookingCount DESC
`;

export const buildTherapistAppointmentsQuery = ({
  clinicCode,
  period,
  therapistName,
}: TherapistAppointmentsQueryOptions): string => `
  SELECT
    BookingID AS bookingId,
    PractitionerName AS therapistName,
    HelperName AS helperName,
    ServiceName AS service,
    CustomerName AS customer,
    FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', CheckInTime) AS date
  FROM \`great_time.MainDataView\`
  WHERE PractitionerName IS NOT NULL
    AND PractitionerName != 'N/A'
    AND TRIM(PractitionerName) != ''
    AND LOWER(ClinicCode) = LOWER('${escapeSqlLiteral(clinicCode)}')
    AND ${buildTherapistDateCondition(period)}
    ${therapistName ? `AND TRIM(PractitionerName) = TRIM('${escapeSqlLiteral(therapistName)}')` : ''}
  ORDER BY CheckInTime DESC
`;
