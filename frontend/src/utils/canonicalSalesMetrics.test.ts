import { describe, expect, it } from 'vitest';
import type {
  OutstandingReportRecord,
  PaymentReportRecord,
  SalesDetailRecord,
} from '../api/apicoreSalesReports';
import {
  resolveCanonicalMetricPeriodRanges,
  summarizeCanonicalSalesMetrics,
} from './canonicalSalesMetrics';

const sale = (invoice: string, amount: number): SalesDetailRecord => ({
  Date: '2026-08-01',
  InvoiceNumber: invoice,
  CustomerName: 'Customer',
  CustomerPhoneNumber: '09111111111',
  MemberId: 'M-1',
  SalePerson: 'Seller',
  PractitionerName: '',
  ServiceName: 'Service',
  ServicePackageName: null,
  WalletTopUp: '',
  PaymentStatus: 'PAID',
  PaymentMethod: 'CASH',
  PaymentType: 'CASH',
  PaymentAmount: amount,
  Note: null,
  PaymentNote: null,
  InvoiceNetTotal: amount,
  ItemQuantity: 1,
  ItemPrice: amount,
  ItemDiscount: 0,
  ItemTotal: amount,
  SubTotal: amount,
  Total: amount,
  NetTotal: amount,
  OrderBalance: 0,
  OrderCreditBalance: 0,
  Discount: 0,
  Tax: 0,
});

const payment = (invoice: string, amount: number): PaymentReportRecord => ({
  Date: '2026-08-01',
  InvoiceNumber: invoice,
  CustomerName: 'Customer',
  MemberId: 'M-1',
  SalePerson: 'Seller',
  ServiceName: 'Service',
  ServicePackageName: '',
  PaymentMethod: 'CASH',
  PaymentStatus: 'PAID',
  WalletTopUp: '',
  PaymentAmount: amount,
});

const outstanding = (
  invoice: string,
  balance: number,
  status: OutstandingReportRecord['PaymentStatus'],
): OutstandingReportRecord => ({
  OrderDate: '2026-08-01',
  InvoiceNumber: invoice,
  CustomerName: 'Customer',
  CustomerPhoneNumber: '09111111111',
  MemberId: 'M-1',
  SalePerson: 'Seller',
  ServiceName: 'Service',
  PaymentMethods: 'CASH',
  InvoiceTotal: balance,
  AmountPaid: 0,
  OutstandingBalance: balance,
  PaymentStatus: status,
  AgeDays: 0,
  AgingBucket: '0-30',
  LastPaymentDate: '',
});

describe('canonical sales metrics', () => {
  it('keeps sales at invoice grain and payments at payment grain', () => {
    const result = summarizeCanonicalSalesMetrics(
      [sale('SO-1', 100000), sale('SO-1', 100000), sale('SO-2', 50000)],
      [payment('SO-1', 60000), payment('SO-1', 40000), payment('SO-2', 25000)],
      [
        outstanding('SO-2', 25000, 'PARTIAL_PAID'),
        outstanding('SO-3', 10000, 'UNPAID'),
      ],
    );

    expect(result).toEqual({
      grossSales: 150000,
      paymentsReceived: 125000,
      invoiceCount: 2,
      paymentCount: 3,
      outstandingBalance: 35000,
      outstandingInvoiceCount: 2,
      partialPaidBalance: 25000,
      unpaidBalance: 10000,
    });
  });

  it('uses equivalent comparison windows for month-to-date', () => {
    const ranges = resolveCanonicalMetricPeriodRanges(
      'monthly',
      new Date(2026, 7, 9, 12, 0, 0),
    );

    expect(ranges.current.startDate).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(ranges.current.endDate).toEqual(new Date(2026, 7, 9, 23, 59, 59, 999));
    expect(ranges.previous.startDate).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
    expect(ranges.previous.endDate).toEqual(new Date(2026, 6, 9, 23, 59, 59, 999));
  });

  it('uses consecutive seven-day windows', () => {
    const ranges = resolveCanonicalMetricPeriodRanges(
      'weekly',
      new Date(2026, 7, 9, 12, 0, 0),
    );

    expect(ranges.current.startDate).toEqual(new Date(2026, 7, 3, 0, 0, 0, 0));
    expect(ranges.previous.startDate).toEqual(new Date(2026, 6, 27, 0, 0, 0, 0));
    expect(ranges.previous.endDate).toEqual(new Date(2026, 7, 2, 23, 59, 59, 999));
  });
});
