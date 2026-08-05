export interface SalesBySalesPersonTransaction {
  Date: string;
  InvoiceNumber: string;
  CustomerName: string;
  CustomerPhoneNumber: string;
  ServiceName: string | null;
  ServicePackageName: string | null;
  PaymentMethod: string;
  PaymentStatus: string;
  PaymentAmount: number;
  SellerName: string | null;
}

export interface SalesPersonSummary {
  salesPerson: string;
  transactionCount: number;
  totalAmount: number;
}

interface SalesQueryParams {
  clinicCode: string;
  startDate: string;
  endDate: string;
}

const escapeSqlString = (value: string) => value.replace(/'/g, "''");

/**
 * PaymentReportView contains both item rows and payment rows. Restricting the
 * result to positive PaymentAmount rows produces one row per actual payment,
 * so invoice totals are not repeated for every service line.
 */
export const buildSalesBySalesPersonQuery = ({
  clinicCode,
  startDate,
  endDate,
}: SalesQueryParams) => {
  const escapedClinicCode = escapeSqlString(clinicCode);

  return `
      WITH invoice_items AS (
        SELECT
          ClinicCode,
          InvoiceNumber,
          STRING_AGG(DISTINCT NULLIF(ServiceName, ''), ', ') AS ServiceName,
          STRING_AGG(DISTINCT NULLIF(ServicePackageName, ''), ', ') AS ServicePackageName
        FROM
          great_time.PaymentReportView
        WHERE
          DATE(OrderCreatedDate) BETWEEN DATE('${startDate}') AND DATE('${endDate}')
          AND LOWER(ClinicCode) = LOWER('${escapedClinicCode}')
        GROUP BY
          ClinicCode, InvoiceNumber
      ),
      paid_transactions AS (
        SELECT
          ClinicCode,
          FORMAT_DATE('%Y-%m-%d', DATE(OrderCreatedDate)) AS Date,
          InvoiceNumber,
          CustomerName,
          CustomerPhoneNumber,
          COALESCE(PaymentType, PaymentMethod) AS PaymentMethod,
          COALESCE(PaymentStatus, 'PAID') AS PaymentStatus,
          CAST(PaymentAmount AS FLOAT64) AS PaymentAmount,
          SellerName
        FROM
          great_time.PaymentReportView
        WHERE
          DATE(OrderCreatedDate) BETWEEN DATE('${startDate}') AND DATE('${endDate}')
          AND CAST(PaymentAmount AS FLOAT64) > 0
          AND COALESCE(PaymentType, PaymentMethod) != 'PASS'
          AND LOWER(ClinicCode) = LOWER('${escapedClinicCode}')
      )
      SELECT
        paid.Date,
        paid.InvoiceNumber,
        paid.CustomerName,
        paid.CustomerPhoneNumber,
        items.ServiceName,
        items.ServicePackageName,
        paid.PaymentMethod,
        paid.PaymentStatus,
        paid.PaymentAmount,
        paid.SellerName
      FROM
        paid_transactions paid
      LEFT JOIN
        invoice_items items
      ON
        paid.ClinicCode = items.ClinicCode
        AND paid.InvoiceNumber = items.InvoiceNumber
      ORDER BY
        paid.Date DESC, paid.InvoiceNumber;
  `;
};

export const filterReportableSalesTransactions = (
  transactions: SalesBySalesPersonTransaction[]
) => transactions.filter(transaction => Number(transaction.PaymentAmount) > 0);

export const summarizeSalesBySalesPerson = (
  transactions: SalesBySalesPersonTransaction[]
): SalesPersonSummary[] => {
  const totals = new Map<string, { count: number; total: number }>();

  transactions.forEach(transaction => {
    const salesPerson = transaction.SellerName || 'Unknown';
    const current = totals.get(salesPerson) || { count: 0, total: 0 };

    totals.set(salesPerson, {
      count: current.count + 1,
      total: current.total + (Number(transaction.PaymentAmount) || 0),
    });
  });

  return Array.from(totals.entries())
    .map(([salesPerson, data]) => ({
      salesPerson,
      transactionCount: data.count,
      totalAmount: data.total,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
};
