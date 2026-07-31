import { format } from 'date-fns';

export const MYANMAR_TIME_ZONE_LABEL = 'MMT (UTC+06:30)';

export interface WalletTransactionSummaryInput {
  transactionNumber: string;
  status: string;
  amount: string | number | null;
}

interface WalletTransactionQueryOptions {
  clinicCode: string;
  startDate: Date | null;
  endDate: Date | null;
}

interface WalletAccountTransactionQueryOptions {
  clinicCode: string;
  ownerName: string;
}

const MYANMAR_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;

const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''");

export const parseWalletNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatMmk = (value: string | number | null | undefined): string => {
  const parsed = parseWalletNumber(value);
  if (parsed === null) return '—';

  return `${parsed.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
    maximumFractionDigits: 2,
  })} MMK`;
};

export const formatSignedMmk = (
  value: string | number | null | undefined,
  status: string,
): string => {
  const parsed = parseWalletNumber(value);
  if (parsed === null) return '—';
  const prefix = status === 'OUT' ? '−' : status === 'IN' ? '+' : '';
  return `${prefix}${formatMmk(Math.abs(parsed))}`;
};

export const getMyanmarWalletDateKey = (value: string): string | null => {
  const match = MYANMAR_DATE_TIME_PATTERN.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

export const formatMyanmarWalletDateTime = (value: string): string => {
  const match = MYANMAR_DATE_TIME_PATTERN.exec(value);
  if (!match) return value || '—';

  const [, year, month, day, hourText, minute] = match;
  const hour = Number(hourText);
  const displayHour = hour % 12 || 12;
  const period = hour >= 12 ? 'PM' : 'AM';
  const monthName = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][Number(month) - 1];

  return `${monthName} ${Number(day)}, ${year}, ${displayHour}:${minute} ${period}`;
};

export const buildWalletTransactionsQuery = ({
  clinicCode,
  startDate,
  endDate,
}: WalletTransactionQueryOptions): string => {
  const dateConditions: string[] = [];
  const myanmarDateExpression =
    "DATE(SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', createddate_myanmar))";

  if (startDate) {
    dateConditions.push(`${myanmarDateExpression} >= DATE('${format(startDate, 'yyyy-MM-dd')}')`);
  }
  if (endDate) {
    dateConditions.push(`${myanmarDateExpression} <= DATE('${format(endDate, 'yyyy-MM-dd')}')`);
  }

  return `
    SELECT
      transactionNumber,
      type,
      status,
      SAFE_CAST(balance AS NUMERIC) AS amount,
      comment,
      SAFE_CAST(accountbalance AS NUMERIC) AS walletBalanceAfter,
      mainAccountID,
      MainAccountName AS walletAccount,
      senderName,
      senderPhone,
      recipientName,
      recipientPhone,
      createddate_myanmar,
      ClinicCode,
      ClinicName
    FROM \`piti-pass.passdb_prod.wallettransaction\`
    WHERE LOWER(ClinicCode) = LOWER('${escapeSqlLiteral(clinicCode)}')
      ${dateConditions.map(condition => `AND ${condition}`).join('\n      ')}
    ORDER BY SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', createddate_myanmar) DESC,
      transactionNumber DESC,
      status ASC
  `;
};

export const buildWalletAccountTransactionsQuery = ({
  clinicCode,
  ownerName,
}: WalletAccountTransactionQueryOptions): string => `
  SELECT
    transactionNumber,
    type,
    status,
    SAFE_CAST(balance AS NUMERIC) AS amount,
    comment,
    SAFE_CAST(accountbalance AS NUMERIC) AS walletBalanceAfter,
    mainAccountID,
    MainAccountName AS walletAccount,
    senderName,
    senderPhone,
    recipientName,
    recipientPhone,
    createddate_myanmar,
    ClinicCode,
    ClinicName
  FROM \`piti-pass.passdb_prod.wallettransaction\`
  WHERE LOWER(ClinicCode) = LOWER('${escapeSqlLiteral(clinicCode)}')
    AND TRIM(MainAccountName) = TRIM('${escapeSqlLiteral(ownerName)}')
  ORDER BY SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', createddate_myanmar) DESC,
    transactionNumber DESC
`;

export const summarizeWalletTransactions = (transactions: WalletTransactionSummaryInput[]) => {
  const uniqueTransactions = new Set(transactions.map(transaction => transaction.transactionNumber)).size;
  let incomingAmount = 0;
  let outgoingAmount = 0;
  let invalidAmountCount = 0;

  transactions.forEach(transaction => {
    const amount = parseWalletNumber(transaction.amount);
    if (amount === null) {
      invalidAmountCount += 1;
      return;
    }
    if (transaction.status === 'IN') incomingAmount += amount;
    if (transaction.status === 'OUT') outgoingAmount += amount;
  });

  return {
    ledgerEntryCount: transactions.length,
    uniqueTransactions,
    incomingAmount,
    outgoingAmount,
    invalidAmountCount,
  };
};
