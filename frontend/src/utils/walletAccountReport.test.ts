import { describe, expect, it } from 'vitest';
import { buildWalletAccountsQuery, summarizeWalletAccounts } from './walletAccountReport';

describe('wallet account report', () => {
  it('uses the wallet side to select the correct account phone and latest balance', () => {
    const query = buildWalletAccountsQuery('denovo');

    expect(query).toContain('WHEN mainAccountID = sender_id THEN senderPhone');
    expect(query).toContain('WHEN mainAccountID = recipient_id THEN recipientPhone');
    expect(query).toContain('ORDER BY activityAt DESC, transactionNumber DESC');
    expect(query).toContain('COUNT(DISTINCT transactionNumber)');
    expect(query).toContain("CONCAT('Unnamed wallet · '");
    expect(query).not.toContain('LIMIT 100');
  });

  it('summarizes the verified De Novo wallet balances without double counting', () => {
    const summary = summarizeWalletAccounts([
      { balance: '299850000' },
      { balance: '150000' },
      { balance: '1000' },
      ...Array.from({ length: 10 }, () => ({ balance: '0' })),
      { balance: '0', needsReview: true },
      { balance: '0', needsReview: true },
    ]);

    expect(summary.totalAccounts).toBe(15);
    expect(summary.totalBalance).toBe(300001000);
    expect(summary.fundedAccounts).toBe(3);
    expect(summary.zeroBalanceAccounts).toBe(12);
    expect(summary.needsReviewAccounts).toBe(2);
    expect(summary.invalidBalanceAccounts).toBe(0);
  });
});
