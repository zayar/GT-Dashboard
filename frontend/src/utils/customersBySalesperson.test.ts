import { describe, expect, it } from 'vitest';
import {
  buildCustomersBySalespersonQuery,
  buildSalespeopleQuery,
} from './customersBySalesperson';

describe('customers by salesperson queries', () => {
  it('loads salespeople by stable seller ID at the report invoice grain', () => {
    const query = buildSalespeopleQuery({ clinicCode: "clinic'code" });

    expect(query).toContain('SellerId AS id');
    expect(query).toContain('great_time.MainPaymentView');
    expect(query).toContain("PaymentStatus = 'PAID'");
    expect(query).toContain("NOT STARTS_WITH(InvoiceNumber, 'CO-')");
    expect(query).toContain("LOWER('clinic''code')");
  });

  it('deduplicates service rows to one NetTotal per paid SO invoice', () => {
    const query = buildCustomersBySalespersonQuery({
      clinicCode: 'gtdenovo',
      sellerId: "seller'id",
    });

    expect(query).toContain("SellerId = 'seller''id'");
    expect(query).toContain('MAX(CAST(payments.NetTotal AS FLOAT64)) AS InvoiceNetTotal');
    expect(query).toContain('SUM(InvoiceNetTotal) AS totalSpend');
    expect(query).toContain("NOT STARTS_WITH(payments.InvoiceNumber, 'CO-')");
    expect(query).not.toContain('SUM(CAST(payments.NetTotal AS FLOAT64))');
  });
});
