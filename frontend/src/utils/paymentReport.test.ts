import { describe, expect, it } from 'vitest';
import {
  filterPaymentsByMethod,
  formatPaymentMmk,
  normalizePaymentMethod,
  summarizePaymentMethods,
} from './paymentReport';

describe('payment report', () => {
  it('formats report values in MMK', () => {
    expect(formatPaymentMmk(20318500)).toBe('20,318,500 MMK');
    expect(formatPaymentMmk('807500.50')).toBe('807,500.50 MMK');
  });

  it('summarizes one transaction per invoice-grain record', () => {
    const records = [
      { PaymentMethod: 'kpay', PaymentAmount: 200000 },
      { PaymentMethod: ' KPAY ', PaymentAmount: '300000' },
      { PaymentMethod: 'cash', PaymentAmount: 150000 },
    ];
    const summary = summarizePaymentMethods(records);

    expect(summary).toEqual([
      { PaymentMethod: 'KPAY', TotalAmount: 500000, TransactionCount: 2 },
      { PaymentMethod: 'CASH', TotalAmount: 150000, TransactionCount: 1 },
    ]);
    expect(normalizePaymentMethod(' kpay ')).toBe('KPAY');
    expect(filterPaymentsByMethod(records, ['KPAY'])).toEqual(records.slice(0, 2));
    expect(filterPaymentsByMethod(records, [])).toEqual(records);
  });

});
