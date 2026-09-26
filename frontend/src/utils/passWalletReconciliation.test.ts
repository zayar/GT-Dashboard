import { describe, expect, it } from 'vitest';
import { summarizePassWallet } from './passWalletReconciliation';

describe('PASS wallet reconciliation', () => {
  it('keeps credited wallet value separate from cash paid for discounted top-ups', () => {
    const result = summarizePassWallet([
      { kind: 'OPENING', date: null, transactionNumber: null, amount: '39036000', invoiceNumber: null },
      { kind: 'IN', date: '2026-04-11', transactionNumber: 'credit-1', amount: '33200000', invoiceNumber: 'TO-FREE' },
      { kind: 'IN', date: '2026-08-31', transactionNumber: 'credit-2', amount: '30000000', invoiceNumber: 'TO-PAID' },
      { kind: 'OUT', date: '2026-08-09', transactionNumber: 'debit-1', amount: '66640000', invoiceNumber: null },
    ], [
      { invoiceNumber: 'TO-FREE', cashPaid: 0, faceValue: 33200000 },
      { invoiceNumber: 'TO-PAID', cashPaid: 18000000, faceValue: 30000000 },
    ]);

    expect(result).toMatchObject({
      openingBalance: 39036000,
      received: 63200000,
      used: 66640000,
      closingBalance: 35596000,
      paidForTopUps: 18000000,
      creditedByTopUps: 63200000,
      missingTopUpOrders: 0,
    });
  });

  it('does not treat an unverified top-up payment as zero cash', () => {
    const result = summarizePassWallet([
      { kind: 'OPENING', date: null, transactionNumber: null, amount: 0, invoiceNumber: null },
      { kind: 'IN', date: '2026-02-01', transactionNumber: 'credit-1', amount: 500, invoiceNumber: 'TO-UNKNOWN' },
    ], [{ invoiceNumber: 'TO-UNKNOWN', cashPaid: null, faceValue: 500 }]);

    expect(result.credits[0].cashPaid).toBeNull();
    expect(result.missingTopUpOrders).toBe(1);
  });
});
