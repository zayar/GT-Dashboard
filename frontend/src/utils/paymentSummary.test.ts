import { describe, expect, it } from 'vitest';
import { calculateCustomerPaymentSummary } from './paymentSummary';

describe('calculateCustomerPaymentSummary', () => {
  it('counts one invoice with multiple service rows only once', () => {
    const summary = calculateCustomerPaymentSummary([
      { invoiceNumber: 'CO-1051257', method: 'KPAY', amount: 591000 },
      { invoiceNumber: 'CO-1051257', method: 'KPAY', amount: 591000 },
      { invoiceNumber: 'CO-1051257', method: 'KPAY', amount: 591000 },
    ]);

    expect(summary.totalSpent).toBe(591000);
    expect(summary.invoiceCount).toBe(1);
    expect(summary.paymentMethods).toEqual([
      { method: 'KPAY', count: 1, total: 591000 },
    ]);
  });

  it('counts a split payment invoice once when it appears on multiple rows', () => {
    const summary = calculateCustomerPaymentSummary([
      { invoiceNumber: 'CO-SPLIT-1', method: 'SPLIT', amount: 120000 },
      { invoiceNumber: 'CO-SPLIT-1', method: 'SPLIT', amount: 120000 },
      { invoiceNumber: 'CO-SPLIT-1', method: 'SPLIT', amount: 120000 },
    ]);

    expect(summary.totalSpent).toBe(120000);
    expect(summary.invoiceCount).toBe(1);
    expect(summary.paymentMethods).toEqual([
      { method: 'SPLIT', count: 1, total: 120000 },
    ]);
  });

  it('sums multiple invoices from the same customer', () => {
    const summary = calculateCustomerPaymentSummary([
      { invoiceNumber: 'CO-1', method: 'CASH', amount: 50000 },
      { invoiceNumber: 'CO-2', method: 'CB', amount: 70000 },
      { invoiceNumber: 'CO-3', method: 'VISA', amount: 90000 },
    ]);

    expect(summary.totalSpent).toBe(210000);
    expect(summary.invoiceCount).toBe(3);
    expect(summary.paymentMethods).toEqual([
      { method: 'CASH', count: 1, total: 50000 },
      { method: 'CB', count: 1, total: 70000 },
      { method: 'VISA', count: 1, total: 90000 },
    ]);
  });

  it('deduplicates repeated invoices while preserving distinct payment methods', () => {
    const summary = calculateCustomerPaymentSummary([
      { invoiceNumber: 'CO-1', method: 'MMQR', amount: 100000 },
      { invoiceNumber: 'CO-1', method: 'MMQR', amount: 100000 },
      { invoiceNumber: 'CO-2', method: 'CASH', amount: 80000 },
      { invoiceNumber: 'CO-2', method: 'CASH', amount: 80000 },
      { invoiceNumber: 'CO-3', method: 'KPAY', amount: 30000 },
    ]);

    expect(summary.totalSpent).toBe(210000);
    expect(summary.invoiceCount).toBe(3);
    expect(summary.paymentMethods).toEqual([
      { method: 'MMQR', count: 1, total: 100000 },
      { method: 'CASH', count: 1, total: 80000 },
      { method: 'KPAY', count: 1, total: 30000 },
    ]);
  });
});
