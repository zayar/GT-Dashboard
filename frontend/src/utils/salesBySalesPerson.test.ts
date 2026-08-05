import { describe, expect, it } from 'vitest';
import {
  buildSalesBySalesPersonQuery,
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
  PaymentAmount: amount,
  SellerName: seller,
});

describe('sales by sales person reporting', () => {
  it('queries actual payment rows and keeps CO invoices', () => {
    const query = buildSalesBySalesPersonQuery({
      clinicCode: "clinic'code",
      startDate: '2026-08-05',
      endDate: '2026-08-05',
    });

    expect(query).toContain('great_time.PaymentReportView');
    expect(query).toContain('CAST(PaymentAmount AS FLOAT64) > 0');
    expect(query).toContain("COALESCE(PaymentStatus, 'PAID') AS PaymentStatus");
    expect(query).not.toContain("AND PaymentStatus = 'PAID'");
    expect(query).toContain("COALESCE(PaymentType, PaymentMethod) != 'PASS'");
    expect(query).not.toContain("NOT STARTS_WITH(InvoiceNumber, 'CO-')");
    expect(query).toContain("LOWER('clinic''code')");
  });

  it('matches the old report totals without multiplying invoices by service rows', () => {
    const rows = [
      transaction('SO-567298', 'Hsu Yee', 7_290_000),
      transaction('SO-715474', 'Nyein Su', 1_200_000),
      transaction('SO-771287', 'Aung Myint Myat', 525_000),
      transaction('SO-516988', 'Mi Mi', 400_000),
      transaction('CO-5837955', 'Mi Mi', 25_000),
      transaction('CO-5291165', 'Thinzar', 35_000),
    ];

    expect(summarizeSalesBySalesPerson(rows)).toEqual([
      { salesPerson: 'Hsu Yee', transactionCount: 1, totalAmount: 7_290_000 },
      { salesPerson: 'Nyein Su', transactionCount: 1, totalAmount: 1_200_000 },
      { salesPerson: 'Aung Myint Myat', transactionCount: 1, totalAmount: 525_000 },
      { salesPerson: 'Mi Mi', transactionCount: 2, totalAmount: 425_000 },
      { salesPerson: 'Thinzar', transactionCount: 1, totalAmount: 35_000 },
    ]);
  });

  it('removes null and zero payment rows before summarizing', () => {
    const rows = [
      transaction('SO-1', 'Seller', 100),
      transaction('SO-2', 'Seller', 0),
      { ...transaction('SO-3', 'Seller', 0), PaymentAmount: null as unknown as number },
    ];

    expect(filterReportableSalesTransactions(rows)).toEqual([rows[0]]);
  });
});
