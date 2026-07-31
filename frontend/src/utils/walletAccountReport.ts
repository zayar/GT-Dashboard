export interface WalletAccountSummaryInput {
  balance: string | number | null;
  needsReview?: boolean;
}

const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''");

export const buildWalletAccountsQuery = (clinicCode: string): string => `
  WITH Base AS (
    SELECT
      COALESCE(
        NULLIF(mainAccountID, ''),
        CONCAT('name:', LOWER(TRIM(MainAccountName)))
      ) AS accountKey,
      NULLIF(TRIM(MainAccountName), '') AS accountName,
      CASE
        WHEN mainAccountID = sender_id THEN senderPhone
        WHEN mainAccountID = recipient_id THEN recipientPhone
        ELSE COALESCE(senderPhone, recipientPhone)
      END AS accountPhone,
      SAFE_CAST(accountbalance AS NUMERIC) AS currentBalance,
      transactionNumber,
      createddate_myanmar,
      SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', createddate_myanmar) AS activityAt
    FROM \`piti-pass.passdb_prod.wallettransaction\`
    WHERE LOWER(ClinicCode) = LOWER('${escapeSqlLiteral(clinicCode)}')
      AND (
        NULLIF(mainAccountID, '') IS NOT NULL
        OR NULLIF(TRIM(MainAccountName), '') IS NOT NULL
      )
  ),
  LatestBalance AS (
    SELECT *
    FROM Base
    QUALIFY ROW_NUMBER() OVER (
      PARTITION BY accountKey
      ORDER BY activityAt DESC, transactionNumber DESC
    ) = 1
  ),
  AccountStats AS (
    SELECT
      accountKey,
      COUNT(DISTINCT transactionNumber) AS transactionCount,
      ARRAY_AGG(
        accountName
        IGNORE NULLS
        ORDER BY activityAt DESC
        LIMIT 1
      )[SAFE_OFFSET(0)] AS accountName,
      ARRAY_AGG(
        NULLIF(accountPhone, '')
        IGNORE NULLS
        ORDER BY activityAt DESC
        LIMIT 1
      )[SAFE_OFFSET(0)] AS phoneNumber
    FROM Base
    GROUP BY accountKey
  )
  SELECT
    COALESCE(
      stats.accountName,
      CONCAT('Unnamed wallet · ', RIGHT(latest.accountKey, 6))
    ) AS name,
    stats.phoneNumber,
    latest.currentBalance AS balance,
    stats.transactionCount,
    latest.createddate_myanmar AS lastActivity,
    stats.accountName IS NULL AS needsReview
  FROM LatestBalance latest
  JOIN AccountStats stats USING (accountKey)
  ORDER BY needsReview ASC, balance DESC, name ASC
`;

export const summarizeWalletAccounts = (accounts: WalletAccountSummaryInput[]) => {
  let totalBalance = 0;
  let fundedAccounts = 0;
  let zeroBalanceAccounts = 0;
  let invalidBalanceAccounts = 0;
  let needsReviewAccounts = 0;

  accounts.forEach(account => {
    if (account.needsReview) needsReviewAccounts += 1;
    const balance = typeof account.balance === 'number'
      ? account.balance
      : Number(account.balance);

    if (!Number.isFinite(balance)) {
      invalidBalanceAccounts += 1;
      return;
    }

    totalBalance += balance;
    if (balance > 0) fundedAccounts += 1;
    if (balance === 0) zeroBalanceAccounts += 1;
  });

  return {
    totalAccounts: accounts.length,
    totalBalance,
    fundedAccounts,
    zeroBalanceAccounts,
    invalidBalanceAccounts,
    needsReviewAccounts,
  };
};
