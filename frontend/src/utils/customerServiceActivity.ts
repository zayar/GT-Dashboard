import {
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export type CustomerServiceActivityPeriod = 'day' | 'week' | 'month' | 'custom';

interface CustomerServiceActivityRangeInput {
  period: CustomerServiceActivityPeriod;
  anchorDate?: Date | null;
  customStartDate?: Date | null;
  customEndDate?: Date | null;
}

export interface CustomerServiceActivityRange {
  startDate: Date;
  endDate: Date;
  startDateKey: string;
  endDateKey: string;
  label: string;
}

interface CustomerServiceActivityQueryInput {
  clinicCode: string;
  startDate: string;
  endDate: string;
}

const SQL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''");

const assertSqlDate = (value: string, fieldName: string) => {
  if (!SQL_DATE_PATTERN.test(value)) {
    throw new Error(`${fieldName} must use yyyy-MM-dd format.`);
  }
};

export const getCustomerServiceActivityRange = ({
  period,
  anchorDate,
  customStartDate,
  customEndDate,
}: CustomerServiceActivityRangeInput): CustomerServiceActivityRange => {
  const anchor = anchorDate ?? new Date();
  let startDate: Date;
  let endDate: Date;

  if (period === 'week') {
    startDate = startOfWeek(anchor, { weekStartsOn: 1 });
    endDate = endOfWeek(anchor, { weekStartsOn: 1 });
  } else if (period === 'month') {
    startDate = startOfMonth(anchor);
    endDate = endOfMonth(anchor);
  } else if (period === 'custom') {
    if (!customStartDate || !customEndDate) {
      throw new Error('Choose both a start date and an end date.');
    }
    if (isAfter(customStartDate, customEndDate)) {
      throw new Error('Start date must be on or before end date.');
    }
    startDate = customStartDate;
    endDate = customEndDate;
  } else {
    startDate = anchor;
    endDate = anchor;
  }

  const startDateKey = format(startDate, 'yyyy-MM-dd');
  const endDateKey = format(endDate, 'yyyy-MM-dd');
  const label = period === 'day'
    ? format(startDate, 'EEEE, MMM d, yyyy')
    : period === 'month'
      ? format(startDate, 'MMMM yyyy')
      : `${format(startDate, 'MMM d, yyyy')} – ${format(endDate, 'MMM d, yyyy')}`;

  return { startDate, endDate, startDateKey, endDateKey, label };
};

export const buildCustomerServiceActivityQuery = ({
  clinicCode,
  startDate,
  endDate,
}: CustomerServiceActivityQueryInput) => {
  assertSqlDate(startDate, 'startDate');
  assertSqlDate(endDate, 'endDate');

  if (startDate > endDate) {
    throw new Error('startDate must be on or before endDate.');
  }

  const clinic = escapeSqlLiteral(clinicCode);

  return `
    WITH VisitsInRange AS (
      SELECT
        CustomerName,
        CustomerPhoneNumber,
        CustomerId,
        ServiceName,
        CheckInTime,
        PractitionerName,
        HelperName
      FROM great_time.MainDataView
      WHERE DATE(CheckInTime) BETWEEN DATE('${startDate}') AND DATE('${endDate}')
        AND LOWER(ClinicCode) = LOWER('${clinic}')
        AND CustomerName IS NOT NULL
        AND ServiceName IS NOT NULL
    ),
    FirstVisits AS (
      SELECT
        CustomerPhoneNumber,
        MIN(DATE(CheckInTime)) AS first_visit_date
      FROM great_time.MainDataView
      WHERE LOWER(ClinicCode) = LOWER('${clinic}')
        AND CustomerName IS NOT NULL
      GROUP BY CustomerPhoneNumber
    ),
    PaymentData AS (
      -- MainPaymentView repeats an invoice for each line item, so aggregate one value per invoice first.
      WITH DeduplicatedInvoices AS (
        SELECT
          CustomerPhoneNumber,
          COALESCE(
            NULLIF(TRIM(InvoiceNumber), ''),
            CONCAT('ORDER:', CAST(OrderId AS STRING))
          ) AS InvoiceKey,
          MAX(CAST(NetTotal AS FLOAT64)) AS InvoiceNetTotal,
          MAX(PaymentMethod) AS PaymentMethod,
          MAX(CASE WHEN PaymentNote IS NOT NULL AND PaymentNote != '' THEN PaymentNote END) AS PaymentNote,
          MAX(SellerName) AS SellerName
        FROM great_time.MainPaymentView
        WHERE DATE(OrderCreatedDate) BETWEEN DATE('${startDate}') AND DATE('${endDate}')
          AND LOWER(ClinicCode) = LOWER('${clinic}')
        GROUP BY CustomerPhoneNumber, InvoiceKey
      )
      SELECT
        CustomerPhoneNumber,
        SUM(InvoiceNetTotal) AS TotalPaymentAmount,
        STRING_AGG(DISTINCT PaymentMethod, ', ') AS PaymentMethods,
        STRING_AGG(DISTINCT CASE WHEN PaymentNote IS NOT NULL AND PaymentNote != '' THEN PaymentNote END, ' | ') AS PaymentNotes,
        STRING_AGG(DISTINCT SellerName, ', ') AS SellerNames
      FROM DeduplicatedInvoices
      GROUP BY CustomerPhoneNumber
    )
    SELECT
      visits.*,
      CASE
        WHEN first_visits.first_visit_date BETWEEN DATE('${startDate}') AND DATE('${endDate}') THEN 'Yes'
        ELSE 'No'
      END AS IsNewCustomer,
      payments.TotalPaymentAmount,
      payments.PaymentMethods,
      payments.PaymentNotes,
      payments.SellerNames
    FROM VisitsInRange visits
    LEFT JOIN FirstVisits first_visits
      ON visits.CustomerPhoneNumber = first_visits.CustomerPhoneNumber
    LEFT JOIN PaymentData payments
      ON visits.CustomerPhoneNumber = payments.CustomerPhoneNumber
    ORDER BY visits.CustomerName, visits.ServiceName
  `;
};
