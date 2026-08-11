import { describe, expect, it } from 'vitest';
import {
  buildSalesBySalesPersonTransactions,
  filterReportableSalesTransactions,
  SalesBySalesPersonTransaction,
  summarizeSalesBySalesPerson,
} from './salesBySalesPerson';

const transaction = (
  invoice: string,
  seller: string,
  amount: number
): SalesBySalesPersonTransaction => ({
  Date: '2026-08-05',
  InvoiceNumber: invoice,
  CustomerName: 'Customer',
  CustomerPhoneNumber: '09123456789',
  ServiceName: null,
  ServicePackageName: null,
  PaymentMethod: 'CASH',
  PaymentStatus: 'PAID',
  SalesAmount: amount,
  AmountPaid: amount,
  OutstandingAmount: 0,
  SellerName: seller,
});

describe('sales by sales person reporting', () => {
  it('collapses invoice rows and uses the as-of outstanding state', () => {
    const rows = [
      {
        Date: '2026-08-01',
        InvoiceNumber: 'SO-924554',
        CustomerName: 'Customer',
        CustomerPhoneNumber: '09123456789',
        SalePerson: 'Hsu Yee',
        ServiceName: 'Glow Booster Injection',
        ServicePackageName: null,
        PaymentMethod: 'MMQR',
        PaymentStatus: 'PAID',
        PaymentAmount: 400_000,
        InvoiceNetTotal: 750_000,
      },
      {
        Date: '2026-08-01',
        InvoiceNumber: 'SO-924554',
        CustomerName: 'Customer',
        CustomerPhoneNumber: '09123456789',
        SalePerson: 'Hsu Yee',
        ServiceName: 'Follow-up Service',
        ServicePackageName: null,
        PaymentMethod: 'CASH',
        PaymentStatus: 'PAID',
        PaymentAmount: 350_000,
        InvoiceNetTotal: 750_000,
      },
    ];

    expect(buildSalesBySalesPersonTransactions(rows, [{
      InvoiceNumber: 'SO-924554',
      AmountPaid: 400_000,
      OutstandingBalance: 350_000,
      PaymentStatus: 'PARTIAL_PAID',
    }])).toEqual([{
      Date: '2026-08-01',
      InvoiceNumber: 'SO-924554',
      CustomerName: 'Customer',
      CustomerPhoneNumber: '09123456789',
      ServiceName: 'Glow Booster Injection, Follow-up Service',
      ServicePackageName: null,
      PaymentMethod: 'MMQR, CASH',
      PaymentStatus: 'PARTIAL_PAID',
      SalesAmount: 750_000,
      AmountPaid: 400_000,
      OutstandingAmount: 350_000,
      SellerName: 'Hsu Yee',
    }]);
  });

  it('summarizes each invoice once without multiplying service rows', () => {
    const rows = [
      transaction('SO-567298', 'Hsu Yee', 7_290_000),
      transaction('SO-715474', 'Nyein Su', 1_200_000),
      transaction('SO-771287', 'Aung Myint Myat', 525_000),
      transaction('SO-516988', 'Mi Mi', 400_000),
      transaction('CO-5837955', 'Mi Mi', 25_000),
      transaction('CO-5291165', 'Thinzar', 35_000),
    ];

    expect(summarizeSalesBySalesPerson(rows)).toEqual([
      { salesPerson: 'Hsu Yee', transactionCount: 1, paidSales: 7_290_000, partialPaidSales: 0, partialOutstandingSales: 0, unpaidSales: 0, totalAmount: 7_290_000 },
      { salesPerson: 'Nyein Su', transactionCount: 1, paidSales: 1_200_000, partialPaidSales: 0, partialOutstandingSales: 0, unpaidSales: 0, totalAmount: 1_200_000 },
      { salesPerson: 'Aung Myint Myat', transactionCount: 1, paidSales: 525_000, partialPaidSales: 0, partialOutstandingSales: 0, unpaidSales: 0, totalAmount: 525_000 },
      { salesPerson: 'Mi Mi', transactionCount: 2, paidSales: 425_000, partialPaidSales: 0, partialOutstandingSales: 0, unpaidSales: 0, totalAmount: 425_000 },
      { salesPerson: 'Thinzar', transactionCount: 1, paidSales: 35_000, partialPaidSales: 0, partialOutstandingSales: 0, unpaidSales: 0, totalAmount: 35_000 },
    ]);
  });

  it('reconciles partial cash received and outstanding amounts to gross sales', () => {
    const rows = [
      transaction('SO-PAID', 'Hsu Yee', 1_710_000),
      {
        ...transaction('SO-924554', 'Hsu Yee', 750_000),
        PaymentStatus: 'PARTIAL_PAID',
        AmountPaid: 400_000,
        OutstandingAmount: 350_000,
      },
      {
        ...transaction('CO-3670176', 'Hsu Yee', 35_000),
        PaymentStatus: 'UNPAID',
        AmountPaid: 0,
        OutstandingAmount: 35_000,
      },
    ];

    const summary = summarizeSalesBySalesPerson(rows);

    expect(summary).toEqual([{
      salesPerson: 'Hsu Yee',
      transactionCount: 3,
      paidSales: 1_710_000,
      partialPaidSales: 400_000,
      partialOutstandingSales: 350_000,
      unpaidSales: 35_000,
      totalAmount: 2_495_000,
    }]);
    expect(
      summary[0].paidSales
      + summary[0].partialPaidSales
      + summary[0].partialOutstandingSales
      + summary[0].unpaidSales
    ).toBe(summary[0].totalAmount);
  });

  it('removes null and zero-value invoices before summarizing', () => {
    const rows = [
      transaction('SO-1', 'Seller', 100),
      transaction('SO-2', 'Seller', 0),
      { ...transaction('SO-3', 'Seller', 0), SalesAmount: null as unknown as number },
    ];

    expect(filterReportableSalesTransactions(rows)).toEqual([rows[0]]);
  });
});
