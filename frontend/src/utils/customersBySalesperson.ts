export interface SalespersonOption {
  id: string;
  name: string;
}

interface ClinicQueryInput {
  clinicCode: string;
}

interface CustomerQueryInput extends ClinicQueryInput {
  sellerId: string;
}

const escapeSqlString = (value: string) => value.replace(/'/g, "''");

export const buildSalespeopleQuery = ({ clinicCode }: ClinicQueryInput) => `
  SELECT
    SellerId AS id,
    ANY_VALUE(SellerName) AS name
  FROM
    great_time.MainPaymentView
  WHERE
    SellerId IS NOT NULL
    AND SellerName IS NOT NULL
    AND SellerName != ''
    AND PaymentStatus = 'PAID'
    AND NOT STARTS_WITH(InvoiceNumber, 'CO-')
    AND PaymentMethod != 'PASS'
    AND LOWER(ClinicCode) = LOWER('${escapeSqlString(clinicCode)}')
  GROUP BY
    SellerId
  ORDER BY
    name
`;

/**
 * Preserve the established report definition: identify customers who have a
 * paid SO invoice from the selected seller, then calculate each customer's
 * clinic-wide lifetime spend from one NetTotal value per paid SO invoice.
 */
export const buildCustomersBySalespersonQuery = ({
  clinicCode,
  sellerId,
}: CustomerQueryInput) => `
  WITH CustomersFromSalesperson AS (
    SELECT DISTINCT
      CustomerName,
      CustomerPhoneNumber
    FROM
      great_time.MainPaymentView
    WHERE
      CustomerName IS NOT NULL
      AND CustomerPhoneNumber IS NOT NULL
      AND SellerId = '${escapeSqlString(sellerId)}'
      AND PaymentStatus = 'PAID'
      AND NOT STARTS_WITH(InvoiceNumber, 'CO-')
      AND LOWER(ClinicCode) = LOWER('${escapeSqlString(clinicCode)}')
  ),
  AllCustomerInvoices AS (
    SELECT
      payments.CustomerName,
      payments.CustomerPhoneNumber,
      payments.InvoiceNumber,
      payments.OrderCreatedDate,
      MAX(payments.MemberID) AS MemberID,
      MAX(CAST(payments.NetTotal AS FLOAT64)) AS InvoiceNetTotal
    FROM
      great_time.MainPaymentView payments
    INNER JOIN
      CustomersFromSalesperson customers
    ON
      payments.CustomerName = customers.CustomerName
      AND payments.CustomerPhoneNumber = customers.CustomerPhoneNumber
    WHERE
      payments.PaymentStatus = 'PAID'
      AND NOT STARTS_WITH(payments.InvoiceNumber, 'CO-')
      AND payments.PaymentMethod != 'PASS'
      AND LOWER(payments.ClinicCode) = LOWER('${escapeSqlString(clinicCode)}')
    GROUP BY
      payments.CustomerName,
      payments.CustomerPhoneNumber,
      payments.InvoiceNumber,
      payments.OrderCreatedDate
  ),
  CustomerSummary AS (
    SELECT
      CustomerName AS name,
      CustomerPhoneNumber AS phoneNumber,
      COALESCE(MAX(MemberID), 'N/A') AS memberId,
      SUM(InvoiceNetTotal) AS totalSpend,
      ARRAY_AGG(
        InvoiceNumber
        ORDER BY OrderCreatedDate DESC, InvoiceNumber DESC
        LIMIT 1
      )[OFFSET(0)] AS lastInvoiceNumber,
      FORMAT_DATETIME('%d %b, %Y', MAX(OrderCreatedDate)) AS lastPurchaseDate
    FROM
      AllCustomerInvoices
    GROUP BY
      CustomerName,
      CustomerPhoneNumber
  )
  SELECT
    name,
    phoneNumber,
    memberId,
    totalSpend,
    lastInvoiceNumber,
    lastPurchaseDate
  FROM
    CustomerSummary
  ORDER BY
    totalSpend DESC, name
`;
