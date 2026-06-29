import { endOfDay, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek } from 'date-fns';

export const MERCHANT_CANCEL_STATUS = 'Merchant Cancel';
export const ORDER_CANCEL_STATUS = 'Cancel Order';
export const DEFAULT_CHECK_IN_OUT_STATUS_FILTER = 'active_records';

export type CheckInOutDateRange = 'day' | 'week' | 'month' | 'custom';

export type CheckInOutStatusFilter =
  | typeof DEFAULT_CHECK_IN_OUT_STATUS_FILTER
  | 'all'
  | 'PAID'
  | 'UNPAID'
  | 'PARTIAL_PAID'
  | typeof ORDER_CANCEL_STATUS
  | typeof MERCHANT_CANCEL_STATUS;

interface BuildCheckInOutRecordsQueryOptions {
  startDate: string;
  endDate: string;
  clinicCode: string;
  statusFilter: CheckInOutStatusFilter;
}

interface CheckInOutDateRangeBoundsOptions {
  dateRange: CheckInOutDateRange;
  reportDate: Date | null;
  customStartDate: Date | null;
  customEndDate: Date | null;
}

export interface CheckInOutDateRangeBounds {
  startDate: Date;
  endDate: Date;
}

const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''");

const normalizeStatusSql = (column: string): string => `LOWER(TRIM(${column}))`;

export const getCheckInOutDateRangeBounds = ({
  dateRange,
  reportDate,
  customStartDate,
  customEndDate,
}: CheckInOutDateRangeBoundsOptions): CheckInOutDateRangeBounds | null => {
  if (dateRange === 'custom') {
    if (!customStartDate || !customEndDate) {
      return null;
    }

    const startDate = startOfDay(customStartDate);
    const endDate = endOfDay(customEndDate);

    if (startDate.getTime() > endDate.getTime()) {
      return null;
    }

    return { startDate, endDate };
  }

  if (!reportDate) {
    return null;
  }

  switch (dateRange) {
    case 'day':
      return {
        startDate: startOfDay(reportDate),
        endDate: endOfDay(reportDate),
      };
    case 'week':
      return {
        startDate: startOfWeek(reportDate, { weekStartsOn: 1 }),
        endDate: endOfWeek(reportDate, { weekStartsOn: 1 }),
      };
    case 'month':
      return {
        startDate: startOfMonth(reportDate),
        endDate: endOfMonth(reportDate),
      };
    default:
      return null;
  }
};

export const buildCheckInOutOrderCancelClause = (operator: 'EXISTS' | 'NOT EXISTS' = 'NOT EXISTS'): string => `
   AND ${operator} (
     SELECT 1
     FROM orders order_status
     WHERE order_status.order_id = v.OrderId
       AND order_status.clinic_id = v.ClinicId
       AND ${normalizeStatusSql('order_status.status')} = 'cancel'
   )`;

export const buildCheckInOutStatusClause = (statusFilter: CheckInOutStatusFilter): string => {
  if (statusFilter === 'all') {
    return '';
  }

  if (statusFilter === DEFAULT_CHECK_IN_OUT_STATUS_FILTER) {
    return ` AND (v.PaymentStatus IS NULL OR ${normalizeStatusSql('v.PaymentStatus')} != LOWER('${MERCHANT_CANCEL_STATUS}'))${buildCheckInOutOrderCancelClause()}`;
  }

  if (statusFilter === ORDER_CANCEL_STATUS) {
    return buildCheckInOutOrderCancelClause('EXISTS');
  }

  if (statusFilter === MERCHANT_CANCEL_STATUS) {
    return ` AND ${normalizeStatusSql('v.PaymentStatus')} = LOWER('${MERCHANT_CANCEL_STATUS}')`;
  }

  return ` AND ${normalizeStatusSql('v.PaymentStatus')} = LOWER('${escapeSqlLiteral(statusFilter)}')${buildCheckInOutOrderCancelClause()}`;
};

export const buildCheckInOutRecordsQuery = ({
  startDate,
  endDate,
  clinicCode,
  statusFilter,
}: BuildCheckInOutRecordsQueryOptions): string => `
      SELECT 
        v.OrderId, v.CheckInTime, v.CheckOutTime, v.Servicename, v.TherapicName, v.HelperName, 
        v.CustomerName, v.CustomerPhoneNumber, v.PaymentMethod, v.PaymentStatus,
        COALESCE(
          (
            SELECT oi.price
            FROM orders item_order
            JOIN order_items oi ON oi.order_id = item_order.id
            JOIN servcies item_service ON item_service.id = oi.service_id
            WHERE item_order.order_id = v.OrderId
              AND item_service.clinic_id = v.ClinicId
              AND TRIM(item_service.name) = TRIM(v.Servicename)
            ORDER BY oi.updated_at DESC
            LIMIT 1
          ),
          (
            SELECT service.price
            FROM servcies service
            WHERE service.clinic_id = v.ClinicId
              AND TRIM(service.name) = TRIM(v.Servicename)
            LIMIT 1
          ),
          v.Total
        ) AS Total,
        COALESCE(v.Discount, 0) AS Discount,
        v.SellerName
      FROM inoutview v
      WHERE v.CheckInTime >= '${escapeSqlLiteral(startDate)}' 
        AND v.CheckInTime <= '${escapeSqlLiteral(endDate)}'
        AND LOWER(v.ClinicCode) = LOWER('${escapeSqlLiteral(clinicCode)}')
    ${buildCheckInOutStatusClause(statusFilter)} ORDER BY v.CheckInTime DESC;`;
