export interface PassWalletMovement {
  kind: 'OPENING' | 'IN' | 'OUT';
  date: string | null;
  transactionNumber: string | null;
  amount: number | string | null;
  invoiceNumber: string | null;
}

export interface PassTopUpOrder {
  invoiceNumber: string;
  cashPaid: number | string | null;
  faceValue: number | string | null;
}

export interface PassWalletCredit {
  date: string;
  invoiceNumber: string | null;
  amount: number;
  cashPaid: number | null;
}

const sqlLiteral = (value: string): string => value.replace(/'/g, "''");

export function buildPassWalletReconciliationQuery(phone: string, clinicPassId: string, year: number): string {
  const phoneDigits = phone.replace(/\D/g, '');
  const phoneSuffix = phoneDigits.startsWith('959') ? phoneDigits.slice(3) : phoneDigits;
  const start = `${year}-01-01 00:00:00`;
  const end = `${year + 1}-01-01 00:00:00`;

  return `
WITH Ledger AS (
  SELECT
    transactionNumber,
    mainAccountID,
    status,
    SAFE_CAST(balance AS NUMERIC) AS amount,
    SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', createddate_myanmar) AS activityAt,
    REGEXP_EXTRACT(comment, r'OrderNo\\((TO-[^)]+)\\)') AS invoiceNumber
  FROM \`piti-pass.passdb_prod.wallettransaction\`
  WHERE LOWER(ClinicCode) = LOWER('${sqlLiteral(clinicPassId)}')
    AND (
      (status = 'IN' AND mainAccountID = recipient_id
        AND ENDS_WITH(REGEXP_REPLACE(COALESCE(recipientPhone, ''), r'[^0-9]', ''), '${sqlLiteral(phoneSuffix)}'))
      OR
      (status = 'OUT' AND mainAccountID = sender_id
        AND ENDS_WITH(REGEXP_REPLACE(COALESCE(senderPhone, ''), r'[^0-9]', ''), '${sqlLiteral(phoneSuffix)}'))
    )
), Deduplicated AS (
  SELECT * FROM Ledger
  WHERE amount > 0 AND activityAt < DATETIME('${end}')
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY transactionNumber, mainAccountID, status
    ORDER BY activityAt DESC
  ) = 1
)
SELECT 'OPENING' AS kind, CAST(NULL AS STRING) AS date,
  CAST(NULL AS STRING) AS transactionNumber,
  COALESCE(SUM(IF(status = 'IN', amount, -amount)), 0) AS amount,
  CAST(NULL AS STRING) AS invoiceNumber
FROM Deduplicated WHERE activityAt < DATETIME('${start}')
UNION ALL
SELECT status AS kind, FORMAT_DATETIME('%Y-%m-%d', activityAt) AS date,
  transactionNumber, amount, invoiceNumber
FROM Deduplicated
WHERE activityAt >= DATETIME('${start}')
ORDER BY date, kind
`;
}

export function buildPassTopUpOrdersQuery(invoiceNumbers: string[]): string {
  const invoices = [...new Set(invoiceNumbers.filter(invoice => /^TO-[A-Za-z0-9-]+$/i.test(invoice)))];
  if (invoices.length === 0) return '';
  return `
WITH Paid AS (
  SELECT order_id, SUM(SAFE_CAST(payment_amount AS FLOAT64)) AS amount
  FROM \`great_time.order_payments\`
  WHERE is_increasement = 1
    AND SAFE_CAST(payment_amount AS FLOAT64) > 0
    AND UPPER(TRIM(payment_method)) != 'PASS'
  GROUP BY order_id
)
SELECT o.order_id AS invoiceNumber,
  SAFE_CAST(o.total AS FLOAT64) AS faceValue,
  CASE
    WHEN p.amount IS NOT NULL THEN p.amount
    WHEN o.net_total = 0 AND UPPER(o.payment_status) = 'PAID' THEN 0
    ELSE NULL
  END AS cashPaid
FROM \`great_time.orders\` o
LEFT JOIN Paid p ON p.order_id = o.id
WHERE o.order_id IN (${invoices.map(invoice => `'${sqlLiteral(invoice)}'`).join(', ')})
QUALIFY ROW_NUMBER() OVER (PARTITION BY o.order_id ORDER BY o.updated_at DESC) = 1
`;
}

export function summarizePassWallet(movements: PassWalletMovement[], orders: PassTopUpOrder[]) {
  const orderByInvoice = new Map(orders.map(order => [order.invoiceNumber, order]));
  const numeric = (value: number | string | null) => Number(value) || 0;
  const opening = movements.find(movement => movement.kind === 'OPENING');
  const openingBalance = numeric(opening?.amount ?? null);
  let received = 0;
  let used = 0;
  let paidForTopUps = 0;
  let creditedByTopUps = 0;
  let otherCredits = 0;
  const credits: PassWalletCredit[] = [];

  movements.forEach(movement => {
    const amount = numeric(movement.amount);
    if (movement.kind === 'IN') {
      received += amount;
      const order = movement.invoiceNumber ? orderByInvoice.get(movement.invoiceNumber) : undefined;
      const cashPaid = order?.cashPaid === null || order?.cashPaid === undefined ? null : numeric(order.cashPaid);
      if (movement.invoiceNumber) {
        creditedByTopUps += amount;
        if (cashPaid !== null) paidForTopUps += cashPaid;
      } else {
        otherCredits += amount;
      }
      credits.push({
        date: movement.date || '',
        invoiceNumber: movement.invoiceNumber,
        amount,
        cashPaid,
      });
    } else if (movement.kind === 'OUT') {
      used += amount;
    }
  });

  return {
    openingBalance,
    received,
    used,
    closingBalance: openingBalance + received - used,
    paidForTopUps,
    creditedByTopUps,
    otherCredits,
    credits,
    missingTopUpOrders: credits.filter(credit => credit.invoiceNumber && credit.cashPaid === null).length,
  };
}
