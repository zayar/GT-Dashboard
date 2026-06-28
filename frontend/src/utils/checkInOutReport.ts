export const MERCHANT_CANCEL_STATUS = 'Merchant Cancel';
export const DEFAULT_CHECK_IN_OUT_STATUS_FILTER = 'exclude_merchant_cancel';

export type CheckInOutStatusFilter =
  | typeof DEFAULT_CHECK_IN_OUT_STATUS_FILTER
  | 'all'
  | 'PAID'
  | 'PENDING'
  | 'CANCELLED'
  | 'REFUNDED'
  | typeof MERCHANT_CANCEL_STATUS;

interface BuildCheckInOutRecordsQueryOptions {
  startDate: string;
  endDate: string;
  clinicCode: string;
  statusFilter: CheckInOutStatusFilter;
}

const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''");

const normalizeStatusSql = (column: string): string => `LOWER(TRIM(${column}))`;

export const buildCheckInOutStatusClause = (statusFilter: CheckInOutStatusFilter): string => {
  if (statusFilter === 'all') {
    return '';
  }

  if (statusFilter === DEFAULT_CHECK_IN_OUT_STATUS_FILTER) {
    return ` AND (v.PaymentStatus IS NULL OR ${normalizeStatusSql('v.PaymentStatus')} != LOWER('${MERCHANT_CANCEL_STATUS}'))`;
  }

  return ` AND ${normalizeStatusSql('v.PaymentStatus')} = LOWER('${escapeSqlLiteral(statusFilter)}')`;
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
