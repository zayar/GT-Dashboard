export type ServiceBehaviorPeriod = 'monthly' | 'quarterly' | 'annual';
export type PerformanceSortKey = 'bookings' | 'sales';
export type SortDirection = 'asc' | 'desc';

export interface RankablePerformanceRow {
  bookings: number;
  totalSales: number;
}

interface ServiceBehaviorQueryParams {
  clinicCode: string;
  clinicId: string;
  period: ServiceBehaviorPeriod;
  selectedYear: number;
  timeZone?: string;
}

export const SERVICE_BEHAVIOR_TIME_ZONE = 'Asia/Yangon';

const escapeSqlLiteral = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "''");

const getDateRange = (period: ServiceBehaviorPeriod, selectedYear: number) => ({
  startDate: `${period === 'annual' ? selectedYear - 2 : selectedYear}-01-01`,
  endDate: `${selectedYear}-12-31`,
});

const getPeriodExpressions = (period: ServiceBehaviorPeriod, dateColumn: string) => {
  if (period === 'monthly') {
    return {
      label: `FORMAT_DATE('%b %Y', ${dateColumn})`,
      order: `EXTRACT(MONTH FROM ${dateColumn})`,
    };
  }

  if (period === 'quarterly') {
    return {
      label: `CONCAT('Q', EXTRACT(QUARTER FROM ${dateColumn}), ' ', EXTRACT(YEAR FROM ${dateColumn}))`,
      order: `EXTRACT(QUARTER FROM ${dateColumn})`,
    };
  }

  return {
    label: `CAST(EXTRACT(YEAR FROM ${dateColumn}) AS STRING)`,
    order: `EXTRACT(YEAR FROM ${dateColumn})`,
  };
};

const buildClinicCte = (clinicCode: string, clinicId: string) => `
    Clinic AS (
      SELECT COALESCE(
        (
          SELECT ANY_VALUE(ClinicID)
          FROM \`great_time.MainPaymentView\`
          WHERE LOWER(ClinicCode) = LOWER('${escapeSqlLiteral(clinicCode)}')
        ),
        '${escapeSqlLiteral(clinicId)}'
      ) AS clinic_id
    )`;

const buildValidBookingsCte = (startDate: string, endDate: string, timeZone: string) => `
    ValidBookings AS (
      SELECT DISTINCT
        COALESCE(NULLIF(TRIM(checkins.booking_id), ''), checkins.id) AS booking_key,
        checkins.order_id,
        checkins.service_id,
        checkins.practitioner_id,
        DATE(DATETIME(TIMESTAMP(checkins.in_time), '${escapeSqlLiteral(timeZone)}')) AS activity_date,
        TRIM(services.name) AS service_name,
        TRIM(practitioners.name) AS practitioner_name
      FROM \`great_time.checkin\` checkins
      CROSS JOIN Clinic clinic
      JOIN \`great_time.ServicesView\` services ON services.id = checkins.service_id
      LEFT JOIN \`great_time.practitioners\` practitioners ON practitioners.id = checkins.practitioner_id
      WHERE checkins.clinic_id = clinic.clinic_id
        AND UPPER(IFNULL(checkins.status, '')) != 'CANCEL'
        AND DATE(DATETIME(TIMESTAMP(checkins.in_time), '${escapeSqlLiteral(timeZone)}'))
          BETWEEN DATE('${startDate}') AND DATE('${endDate}')
        AND services.name IS NOT NULL
        AND TRIM(services.name) != ''
        AND LOWER(TRIM(services.name)) NOT IN ('booking deposit', 'booking deposits', 'deposit')
    )`;

const buildAllocatedSalesCtes = (startDate: string, endDate: string, timeZone: string) => `
    ValidPaidOrders AS (
      SELECT
        orders.id AS order_pk,
        DATE(DATETIME(TIMESTAMP(orders.created_at), '${escapeSqlLiteral(timeZone)}')) AS activity_date,
        CAST(orders.net_total AS FLOAT64) AS order_net_total
      FROM \`great_time.orders\` orders
      CROSS JOIN Clinic clinic
      WHERE orders.clinic_id = clinic.clinic_id
        AND UPPER(IFNULL(orders.status, '')) IN ('ACTIVE', 'DONE')
        AND UPPER(IFNULL(orders.payment_status, '')) = 'PAID'
        AND UPPER(IFNULL(orders.payment_method, '')) != 'PASS'
        AND CAST(orders.net_total AS FLOAT64) > 0
        AND DATE(DATETIME(TIMESTAMP(orders.created_at), '${escapeSqlLiteral(timeZone)}'))
          BETWEEN DATE('${startDate}') AND DATE('${endDate}')
    ),
    OrderItemsWithAllocation AS (
      SELECT
        valid_orders.order_pk,
        valid_orders.activity_date,
        valid_orders.order_net_total,
        order_items.id AS order_item_id,
        order_items.service_id,
        GREATEST(CAST(IFNULL(order_items.total, 0) AS FLOAT64), 0) AS item_total,
        SUM(GREATEST(CAST(IFNULL(order_items.total, 0) AS FLOAT64), 0))
          OVER (PARTITION BY valid_orders.order_pk) AS order_item_total
      FROM ValidPaidOrders valid_orders
      JOIN \`great_time.order_items\` order_items ON order_items.order_id = valid_orders.order_pk
    ),
    AllocatedServiceSales AS (
      SELECT
        allocated_items.order_pk,
        allocated_items.service_id,
        allocated_items.activity_date,
        TRIM(services.name) AS service_name,
        SUM(
          allocated_items.order_net_total
          * SAFE_DIVIDE(allocated_items.item_total, allocated_items.order_item_total)
        ) AS total_sales
      FROM OrderItemsWithAllocation allocated_items
      JOIN \`great_time.ServicesView\` services ON services.id = allocated_items.service_id
      WHERE allocated_items.service_id IS NOT NULL
        AND allocated_items.item_total > 0
        AND allocated_items.order_item_total > 0
        AND services.name IS NOT NULL
        AND TRIM(services.name) != ''
        AND LOWER(TRIM(services.name)) NOT IN ('booking deposit', 'booking deposits', 'deposit')
      GROUP BY
        allocated_items.order_pk,
        allocated_items.service_id,
        allocated_items.activity_date,
        service_name
    )`;

export const buildServicePerformanceQuery = (params: ServiceBehaviorQueryParams) => {
  const { startDate, endDate } = getDateRange(params.period, params.selectedYear);
  const timeZone = params.timeZone || SERVICE_BEHAVIOR_TIME_ZONE;
  const bookingPeriod = getPeriodExpressions(params.period, 'activity_date');

  return `
    WITH
    ${buildClinicCte(params.clinicCode, params.clinicId)},
    ${buildValidBookingsCte(startDate, endDate, timeZone)},
    ${buildAllocatedSalesCtes(startDate, endDate, timeZone)},
    BookingPerformance AS (
      SELECT
        service_name,
        ${bookingPeriod.label} AS period_label,
        ${bookingPeriod.order} AS period_order,
        COUNT(DISTINCT booking_key) AS bookings
      FROM ValidBookings
      GROUP BY service_name, period_label, period_order
    ),
    SalesPerformance AS (
      SELECT
        service_name,
        ${bookingPeriod.label} AS period_label,
        ${bookingPeriod.order} AS period_order,
        SUM(total_sales) AS total_sales
      FROM AllocatedServiceSales
      GROUP BY service_name, period_label, period_order
    )
    SELECT
      COALESCE(bookings.service_name, sales.service_name) AS serviceName,
      COALESCE(bookings.period_label, sales.period_label) AS month,
      COALESCE(bookings.period_order, sales.period_order) AS periodOrder,
      IFNULL(bookings.bookings, 0) AS bookingCount,
      ROUND(IFNULL(sales.total_sales, 0), 2) AS totalSales
    FROM BookingPerformance bookings
    FULL OUTER JOIN SalesPerformance sales
      ON sales.service_name = bookings.service_name
      AND sales.period_label = bookings.period_label
      AND sales.period_order = bookings.period_order
    ORDER BY periodOrder ASC, serviceName ASC
  `;
};

export const buildMonthlyBookingTotalsQuery = (params: ServiceBehaviorQueryParams) => {
  const { startDate, endDate } = getDateRange(params.period, params.selectedYear);
  const timeZone = params.timeZone || SERVICE_BEHAVIOR_TIME_ZONE;
  const bookingPeriod = getPeriodExpressions(params.period, 'activity_date');

  return `
    WITH
    ${buildClinicCte(params.clinicCode, params.clinicId)},
    ${buildValidBookingsCte(startDate, endDate, timeZone)}
    SELECT
      ${bookingPeriod.label} AS month,
      ${bookingPeriod.order} AS periodOrder,
      COUNT(DISTINCT booking_key) AS totalBookings
    FROM ValidBookings
    GROUP BY month, periodOrder
    ORDER BY periodOrder ASC
  `;
};

export const buildPractitionerServicePerformanceQuery = (params: ServiceBehaviorQueryParams) => {
  const { startDate, endDate } = getDateRange(params.period, params.selectedYear);
  const timeZone = params.timeZone || SERVICE_BEHAVIOR_TIME_ZONE;

  return `
    WITH
    ${buildClinicCte(params.clinicCode, params.clinicId)},
    ${buildValidBookingsCte(startDate, endDate, timeZone)},
    ${buildAllocatedSalesCtes(startDate, endDate, timeZone)},
    PractitionerBookings AS (
      SELECT
        practitioner_name,
        service_name,
        COUNT(DISTINCT booking_key) AS bookings
      FROM ValidBookings
      WHERE practitioner_name IS NOT NULL
        AND practitioner_name != ''
      GROUP BY practitioner_name, service_name
    ),
    PractitionerLinks AS (
      SELECT DISTINCT
        checkins.order_id AS order_pk,
        checkins.service_id,
        TRIM(practitioners.name) AS practitioner_name
      FROM \`great_time.checkin\` checkins
      CROSS JOIN Clinic clinic
      JOIN \`great_time.practitioners\` practitioners ON practitioners.id = checkins.practitioner_id
      WHERE checkins.clinic_id = clinic.clinic_id
        AND checkins.order_id IS NOT NULL
        AND checkins.service_id IS NOT NULL
        AND UPPER(IFNULL(checkins.status, '')) != 'CANCEL'
        AND practitioners.name IS NOT NULL
        AND TRIM(practitioners.name) != ''
    ),
    PractitionerLinkCounts AS (
      SELECT order_pk, service_id, COUNT(*) AS practitioner_count
      FROM PractitionerLinks
      GROUP BY order_pk, service_id
    ),
    PractitionerSales AS (
      SELECT
        links.practitioner_name,
        sales.service_name,
        SUM(SAFE_DIVIDE(sales.total_sales, link_counts.practitioner_count)) AS total_sales
      FROM AllocatedServiceSales sales
      JOIN PractitionerLinks links
        ON links.order_pk = sales.order_pk
        AND links.service_id = sales.service_id
      JOIN PractitionerLinkCounts link_counts
        ON link_counts.order_pk = sales.order_pk
        AND link_counts.service_id = sales.service_id
      GROUP BY links.practitioner_name, sales.service_name
    )
    SELECT
      COALESCE(bookings.practitioner_name, sales.practitioner_name) AS practitionerName,
      COALESCE(bookings.service_name, sales.service_name) AS serviceName,
      IFNULL(bookings.bookings, 0) AS bookingCount,
      ROUND(IFNULL(sales.total_sales, 0), 2) AS totalSales
    FROM PractitionerBookings bookings
    FULL OUTER JOIN PractitionerSales sales
      ON sales.practitioner_name = bookings.practitioner_name
      AND sales.service_name = bookings.service_name
    ORDER BY bookingCount DESC, totalSales DESC, practitionerName ASC, serviceName ASC
  `;
};

export const sortPerformanceRows = <T extends RankablePerformanceRow>(
  rows: T[],
  sortKey: PerformanceSortKey,
  direction: SortDirection,
  getStableLabel: (row: T) => string,
) => [...rows].sort((left, right) => {
  const leftValue = sortKey === 'bookings' ? left.bookings : left.totalSales;
  const rightValue = sortKey === 'bookings' ? right.bookings : right.totalSales;
  const numericDifference = leftValue - rightValue;

  if (numericDifference !== 0) {
    return direction === 'asc' ? numericDifference : -numericDifference;
  }

  return getStableLabel(left).localeCompare(getStableLabel(right));
});
