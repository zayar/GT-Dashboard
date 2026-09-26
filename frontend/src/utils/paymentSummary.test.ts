import { describe, expect, it } from 'vitest';
import { buildCustomerPaymentBreakdown, isTopUpInvoice } from './paymentSummary';

describe('customer payment breakdown', () => {
  it('counts top-ups as MMK received and PASS reuse only as PASS spending', () => {
    const result = buildCustomerPaymentBreakdown([
      { invoiceNumber: 'TO-1', method: 'KBZ', invoiceTotal: 9000000, paymentAmount: 9000000, status: 'PAID' },
      { invoiceNumber: 'SC-1', method: 'pass', invoiceTotal: 4000000, paymentAmount: 4000000, status: 'PAID', ServiceName: 'Treatment' },
      { invoiceNumber: 'SC-2', method: ' PASS ', invoiceTotal: 2000000, paymentAmount: 2000000, status: 'PAID', ServicePackageName: 'Package' },
      { invoiceNumber: 'SO-1', method: 'CASH', invoiceTotal: 1500000, paymentAmount: 1500000, status: 'PAID', ServiceName: 'Consultation' },
    ]);

    expect(result.summary).toMatchObject({
      mmkSpent: 10500000,
      passSpent: 6000000,
      topUpSpent: 9000000,
      mmkInvoiceCount: 2,
      passInvoiceCount: 2,
    });
    expect(result.mmkRows.map((row) => row.invoiceNumber)).toEqual(['TO-1', 'SO-1']);
    expect(result.passRows.map((row) => row.invoiceNumber)).toEqual(['SC-1', 'SC-2']);
    expect(result.mmkRows[0].topUpAmount).toBe(9000000);
    expect(result.passRows[0].topUpAmount).toBeNull();
    expect(result.passRows[1].ServicePackageName).toBe('Package');
  });

  it('retains each service line but counts repeated invoice and payment values once', () => {
    const result = buildCustomerPaymentBreakdown([
      { invoiceNumber: 'CO-1', method: 'KPAY', invoiceTotal: 591000, paymentAmount: 591000, status: 'PAID', ServiceName: 'Service A' },
      { invoiceNumber: 'CO-1', method: 'KPAY', invoiceTotal: 591000, paymentAmount: 591000, status: 'PAID', ServiceName: 'Service B' },
      { invoiceNumber: 'CO-1', method: 'KPAY', invoiceTotal: 591000, paymentAmount: null, status: 'PAID', ServiceName: 'Service C' },
    ]);

    expect(result.summary.mmkSpent).toBe(591000);
    expect(result.summary.mmkInvoiceCount).toBe(1);
    expect(result.summary.paymentMethods).toEqual([{ method: 'KPAY', count: 1, total: 591000 }]);
    expect(result.mmkRows.map((row) => row.invoiceTotal)).toEqual([591000, 591000, 591000]);
    expect(result.mmkRows.map((row) => row.displayAmount)).toEqual([591000, null, null]);
  });

  it('uses payment amounts for a split invoice and counts a partial payment only once', () => {
    const result = buildCustomerPaymentBreakdown([
      { invoiceNumber: 'CO-SPLIT', method: 'CASH', invoiceTotal: 100000, paymentAmount: 60000, status: 'PAID' },
      { invoiceNumber: 'CO-SPLIT', method: 'PASS', invoiceTotal: 100000, paymentAmount: 40000, status: 'PAID' },
      { invoiceNumber: 'CO-PARTIAL', method: 'KBZ', invoiceTotal: 200000, paymentAmount: 50000, status: 'PARTIAL_PAID' },
      { invoiceNumber: 'CO-UNPAID', method: 'CASH', invoiceTotal: 300000, paymentAmount: null, status: 'UNPAID' },
    ]);

    expect(result.summary.mmkSpent).toBe(110000);
    expect(result.summary.passSpent).toBe(40000);
    expect(result.summary.mmkInvoiceCount).toBe(2);
    expect(result.summary.passInvoiceCount).toBe(1);
    expect(result.mmkRows.map((row) => row.invoiceNumber)).toEqual(['CO-SPLIT', 'CO-PARTIAL']);
    expect(result.passRows[0].invoiceTotal).toBe(100000);
  });

  it('falls back to one invoice total when legacy payment amount is missing', () => {
    const result = buildCustomerPaymentBreakdown([
      { invoiceNumber: 'SO-1', method: 'BANK', invoiceTotal: 750000, status: 'PAID', ServiceName: 'Service A' },
      { invoiceNumber: 'SO-1', method: 'BANK', invoiceTotal: 750000, status: 'PAID', ServiceName: 'Service B' },
    ]);

    expect(result.summary.mmkSpent).toBe(750000);
    expect(result.mmkRows.map((row) => row.displayAmount)).toEqual([750000, null]);
  });

  it('does not guess the cash and PASS split when payment amounts are missing', () => {
    const result = buildCustomerPaymentBreakdown([
      { invoiceNumber: 'CO-MIXED', method: 'CASH', invoiceTotal: 100000, status: 'PAID' },
      { invoiceNumber: 'CO-MIXED', method: 'PASS', invoiceTotal: 100000, status: 'PAID' },
    ]);

    expect(result.summary.mmkSpent).toBe(0);
    expect(result.summary.passSpent).toBe(0);
    expect(result.summary.unallocatedInvoiceCount).toBe(1);
    expect(result.mmkRows[0].invoiceTotal).toBe(100000);
    expect(result.passRows[0].invoiceTotal).toBe(100000);
  });

  it('recognizes only TO invoices as top-ups', () => {
    expect(isTopUpInvoice(' to-063772 ')).toBe(true);
    expect(isTopUpInvoice('SO-063772')).toBe(false);
  });
});
