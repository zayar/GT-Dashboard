import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { mapSalesDetailRecords } from '../api/apicoreSalesReports';
import { buildSalesDetailDisplayRows, buildSalesDetailExportRows } from './salesDetails';

const order = {
  id: 'internal-order-key',
  order_id: 'SO-001',
  member_id: 'internal-customer-key',
  member: { name: 'Customer', member_id: '', clinic_members: [{ member_id: ' ' }] },
  created_at: '2026-11-02T03:00:00.000Z',
  status: 'ACTIVE',
  payment_method: 'SPLIT',
  payment_status: 'PAID',
  total: 101500,
  net_total: 95000,
  discount: 6500,
  payments: [
    { id: 'payment-1', payment_method: 'CASH', payment_amount: 50000, payment_date: '2026-11-02T03:00:00.000Z' },
    { id: 'payment-2', payment_method: 'KPAY', payment_amount: 40000, payment_date: '2026-11-02T03:00:00.000Z' },
    { id: 'payment-3', payment_method: 'CASH', payment_amount: 5000, payment_date: '2026-11-02T03:00:00.000Z' },
  ],
  order_items: [
    { id: 'line-1', quantity: 3, price: 35000, total: 100000, metadata: '{"discount":5000}', product_stock_item: { name: 'Product' } },
    { id: 'line-2', quantity: 1, price: 1500, total: 1500, service: { name: 'Service' } },
  ],
};

describe('Sales Details table and Excel rows', () => {
  it('keeps discounts on each line and existing invoice totals only on the first row', () => {
    const rows = buildSalesDetailDisplayRows(mapSalesDetailRecords([order]), 'detailed');

    expect(rows.map(row => row.ItemDiscount)).toEqual([5000, 0, null]);
    expect(rows.map(row => row.Discount)).toEqual([6500, null, null]);
    expect(rows.map(row => row.InvoiceNetTotal)).toEqual([95000, null, null]);
    expect(rows.map(row => row.MemberId)).toEqual(['', '', '']);
    expect(Object.keys(rows[0]).slice(10, 13)).toEqual(['ItemPrice', 'ItemDiscount', 'ItemTotal']);
  });

  it('sums item discounts once per invoice in summary view, including Excel', () => {
    const rows = mapSalesDetailRecords([{
      ...order,
      order_items: [order.order_items[0], { ...order.order_items[1], metadata: '{"discount":"1000"}' }],
    }]);
    const summary = buildSalesDetailDisplayRows(rows, 'summary');

    expect(summary).toHaveLength(1);
    expect(summary[0].ItemDiscount).toBe(6000);
    expect(summary[0].Discount).toBe(6500);
    expect(buildSalesDetailExportRows(summary)[0]['Item Discount']).toBe(6000);
  });

  it('writes numeric item discounts and blank unassigned member IDs into the actual XLSX workbook', () => {
    const records = mapSalesDetailRecords([order]);
    const rows = buildSalesDetailExportRows(buildSalesDetailDisplayRows(records, 'detailed'));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Payment Details');
    const parsed = XLSX.read(XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }), { type: 'buffer' });
    const exported = XLSX.utils.sheet_to_json<Record<string, unknown>>(parsed.Sheets['Payment Details'], { defval: '' });

    expect(exported.map(row => row['Member ID'])).toEqual(['', '', '']);
    expect(exported.map(row => row['Item Discount'])).toEqual([5000, 0, '']);
    expect(exported.map(row => row['Discount'])).toEqual([6500, '', '']);
    expect(exported.map(row => row['Invoice Total'])).toEqual([95000, '', '']);
    const column = Object.keys(rows[0]).indexOf('Item Discount');
    expect(parsed.Sheets['Payment Details'][XLSX.utils.encode_cell({ r: 2, c: column })].t).toBe('n');
  });
});
