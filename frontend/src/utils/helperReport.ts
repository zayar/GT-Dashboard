import {
  buildStaffDateCondition,
  getStaffReportPeriod,
  StaffFilterType,
  StaffReportPeriod,
} from './staffReportPeriod';

export type HelperFilterType = StaffFilterType;
export type HelperReportPeriod = StaffReportPeriod;
export const getHelperReportPeriod = getStaffReportPeriod;

interface HelperQueryOptions {
  clinicCode: string;
  period: HelperReportPeriod;
}

interface HelperAppointmentsQueryOptions extends HelperQueryOptions {
  helperName?: string | null;
}

const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''");

export const buildHelperSummaryQuery = ({
  clinicCode,
  period,
}: HelperQueryOptions): string => `
  SELECT
    HelperName AS name,
    COUNT(*) AS bookingCount
  FROM \`great_time.MainDataView\`
  WHERE HelperName IS NOT NULL
    AND HelperName != 'N/A'
    AND TRIM(HelperName) != ''
    AND LOWER(ClinicCode) = LOWER('${escapeSqlLiteral(clinicCode)}')
    AND ${buildStaffDateCondition(period)}
  GROUP BY HelperName
  ORDER BY bookingCount DESC
`;

export const buildHelperAppointmentsQuery = ({
  clinicCode,
  period,
  helperName,
}: HelperAppointmentsQueryOptions): string => `
  SELECT
    BookingID AS bookingId,
    HelperName AS helperName,
    ServiceName AS service,
    CustomerName AS customer,
    PractitionerName AS practitioner,
    FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', CheckInTime) AS date
  FROM \`great_time.MainDataView\`
  WHERE HelperName IS NOT NULL
    AND HelperName != 'N/A'
    AND TRIM(HelperName) != ''
    AND LOWER(ClinicCode) = LOWER('${escapeSqlLiteral(clinicCode)}')
    AND ${buildStaffDateCondition(period)}
    ${helperName ? `AND TRIM(HelperName) = TRIM('${escapeSqlLiteral(helperName)}')` : ''}
  ORDER BY CheckInTime DESC
`;
