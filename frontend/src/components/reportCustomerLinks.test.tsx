import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { mapPaymentReportRecords, mapSalesDetailRecords } from '../api/apicoreSalesReports';
import { buildSalesDetailDisplayRows } from '../utils/salesDetails';
import DataTable from './DataTable';

vi.mock('../contexts/ClinicContext', () => ({ useClinic: () => ({ currentClinic: { id: 'a', code: 'A' } }) }));

const order = (id: string, name: string, phone: string) => ({
  id, order_id: id, member_id: 'internal-' + id, created_at: '2026-11-05T03:00:00Z',
  member: { name, phonenumber: phone },
  payments: [{ id: 'payment-' + id, payment_amount: 250, payment_method: 'CASH', payment_date: '2026-11-05T03:00:00Z' }],
});
const orders = [order('1', 'Anyone', '+9591234'), order('2', 'Anyone', '095020584'), order('3', 'Walk-in guest', '')];
const sales = mapSalesDetailRecords(orders);
const payments = mapPaymentReportRecords(orders, new Date(2026, 10, 5), new Date(2026, 10, 5, 23, 59, 59));

describe('customer links in BI reports', () => {
  it.each([
    ['Sales Details', buildSalesDetailDisplayRows(sales, 'detailed')],
    ['Sales Details', buildSalesDetailDisplayRows(sales, 'summary')],
    ['Payment Report', payments],
  ] as const)('uses the phone on the exact %s row and leaves an unidentified guest as text', (label, records) => {
    const html = renderToStaticMarkup(<StaticRouter location="/report">
      <DataTable data={records} customerReturnLabel={label} columnAliases={{ CustomerName: 'Customer Name', MemberId: 'Member ID' }} />
    </StaticRouter>);
    expect(html).toContain('href="/customers/%2B9591234"');
    expect(html).toContain('href="/customers/095020584"');
    expect(html).toContain('Walk-in guest');
    expect(html.match(/href="\/customers\//g)).toHaveLength(2);
    expect(html).not.toContain('/customers/Anyone');
    expect(html).not.toContain('CustomerPhoneNumber');
  });
});
