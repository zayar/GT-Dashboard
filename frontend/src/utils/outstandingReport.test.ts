import { describe, expect, it } from 'vitest';
import { OutstandingReportRecord } from '../api/apicoreSalesReports';
import {
  buildAgingBreakdown,
  buildOutstandingBreakdown,
  filterOutstandingRecords,
  summarizeOutstandingRecords,
} from './outstandingReport';

const record = (
  overrides: Partial<OutstandingReportRecord>,
): OutstandingReportRecord => ({
  OrderDate: '2026-08-01',
  InvoiceNumber: 'SO-1',
  CustomerName: 'Customer One',
  CustomerPhoneNumber: '09111111111',
  MemberId: 'M-1',
  SalePerson: 'Hsu Yee',
  ServiceName: 'Facial',
  PaymentMethods: 'CASH',
  InvoiceTotal: 750000,
  AmountPaid: 400000,
  OutstandingBalance: 350000,
  PaymentStatus: 'PARTIAL_PAID',
  AgeDays: 8,
  AgingBucket: '0-30',
  LastPaymentDate: '2026-08-01',
  ...overrides,
});

describe('outstanding receivables reporting', () => {
  const records = [
    record({}),
    record({
      InvoiceNumber: 'CO-2',
      CustomerName: 'Customer Two',
      CustomerPhoneNumber: '09222222222',
      InvoiceTotal: 35000,
      AmountPaid: 0,
      OutstandingBalance: 35000,
      PaymentStatus: 'UNPAID',
      AgeDays: 45,
      AgingBucket: '31-60',
    }),
    record({
      InvoiceNumber: 'SO-3',
      CustomerName: 'Customer Three',
      SalePerson: 'Mi Mi',
      InvoiceTotal: 100000,
      AmountPaid: 0,
      OutstandingBalance: 100000,
      PaymentStatus: 'UNPAID',
      AgeDays: 95,
      AgingBucket: '90+',
    }),
  ];

  it('calculates balances that reconcile to invoice totals', () => {
    expect(summarizeOutstandingRecords(records)).toEqual({
      invoiceCount: 3,
      invoiceTotal: 885000,
      amountPaid: 400000,
      outstandingBalance: 485000,
      partialPaidBalance: 350000,
      unpaidBalance: 135000,
      agedOver30Balance: 135000,
    });
  });

  it('filters by salesperson, payment status, aging, and invoice/customer search', () => {
    expect(filterOutstandingRecords(records, {
      search: 'CO-2',
      salesPerson: 'Hsu Yee',
      paymentStatus: 'UNPAID',
      agingBucket: '31-60',
    }).map((entry) => entry.InvoiceNumber)).toEqual(['CO-2']);

    expect(filterOutstandingRecords(records, {
      search: '092222',
      salesPerson: 'ALL',
      paymentStatus: 'ALL',
      agingBucket: 'ALL',
    }).map((entry) => entry.InvoiceNumber)).toEqual(['CO-2']);
  });

  it('builds complete aging and ranked operational breakdowns', () => {
    expect(buildAgingBreakdown(records)).toEqual([
      { label: '0-30', invoiceCount: 1, outstandingBalance: 350000 },
      { label: '31-60', invoiceCount: 1, outstandingBalance: 35000 },
      { label: '61-90', invoiceCount: 0, outstandingBalance: 0 },
      { label: '90+', invoiceCount: 1, outstandingBalance: 100000 },
    ]);
    expect(buildOutstandingBreakdown(records, (entry) => entry.SalePerson)[0]).toEqual({
      label: 'Hsu Yee',
      invoiceCount: 2,
      outstandingBalance: 385000,
    });
  });
});
