import { describe, expect, it } from 'vitest';
import {
  buildWalletAccountTransactionsQuery,
  buildWalletTransactionsQuery,
  formatMyanmarWalletDateTime,
  formatSignedMmk,
  getMyanmarWalletDateKey,
  summarizeWalletTransactions,
} from './walletTransactionReport';

describe('wallet transaction report', () => {
  it('treats the source date as a Myanmar wall-clock value without timezone shifting', () => {
    const source = '2026-07-08 16:49:56';
    expect(getMyanmarWalletDateKey(source)).toBe('2026-07-08');
    expect(formatMyanmarWalletDateTime(source)).toBe('Jul 8, 2026, 4:49 PM');
  });

  it('formats ledger direction without changing the source amount', () => {
    expect(formatSignedMmk('150000.00', 'IN')).toBe('+150,000 MMK');
    expect(formatSignedMmk('150000.00', 'OUT')).toBe('−150,000 MMK');
  });

  it('does not double-count paired ledger entries as separate transfers', () => {
    const summary = summarizeWalletTransactions([
      { transactionNumber: 'A', status: 'OUT', amount: '150000' },
      { transactionNumber: 'A', status: 'IN', amount: '150000' },
      { transactionNumber: 'B', status: 'OUT', amount: '300000' },
      { transactionNumber: 'B', status: 'IN', amount: '300000' },
    ]);

    expect(summary.ledgerEntryCount).toBe(4);
    expect(summary.uniqueTransactions).toBe(2);
    expect(summary.incomingAmount).toBe(450000);
    expect(summary.outgoingAmount).toBe(450000);
    expect(summary.invalidAmountCount).toBe(0);
  });

  it('filters on parsed Myanmar dates and has no silent 100-row limit', () => {
    const query = buildWalletTransactionsQuery({
      clinicCode: 'denovo',
      startDate: new Date(2026, 6, 1),
      endDate: new Date(2026, 6, 21),
    });

    expect(query).toContain("SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', createddate_myanmar)");
    expect(query).toContain("DATE('2026-07-01')");
    expect(query).toContain("DATE('2026-07-21')");
    expect(query).not.toContain('LIMIT 100');
  });

  it('builds an uncapped, safely escaped account ledger query', () => {
    const query = buildWalletAccountTransactionsQuery({
      clinicCode: "de'novo",
      ownerName: "O'Brien",
    });

    expect(query).toContain("LOWER('de''novo')");
    expect(query).toContain("TRIM('O''Brien')");
    expect(query).toContain('SAFE_CAST(balance AS NUMERIC) AS amount');
    expect(query).toContain("SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', createddate_myanmar)");
    expect(query).not.toContain('LIMIT');
  });
});
