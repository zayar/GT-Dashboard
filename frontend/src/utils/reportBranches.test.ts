import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { mapPaymentReportRecords, mapSalesDetailRecords } from '../api/apicoreSalesReports';
import { getReportBranches } from './clinicBranches';
import { formatReportTotal, labelBranchRows, readBranchRows } from './reportBranches';
import { buildPaymentWorkbook } from './reportWorkbooks';
import { buildSalesDetailDisplayRows, buildSalesDetailExportRows } from './salesDetails';

const clinic = (id: string, companyId?: string, currency = 'MMK') => ({
  id, companyId, code: id.toUpperCase(), name: 'Clinic', currency, active: 1, logo: '',
});
const clinics = [clinic('north', 'one'), clinic('south', 'one', 'USD'), clinic('east', 'two'), clinic('orphan')];

describe('owner report branches', () => {
  it('keeps the current branch as the default, disambiguates names and restricts All to the accessible company', () => {
    expect(getReportBranches(clinics, 'north', false).map(row => row.reportName)).toEqual(['Clinic · NORTH']);
    expect(getReportBranches(clinics, 'south', true).map(row => row.id)).toEqual(['north', 'south']);
    expect(getReportBranches(clinics, 'orphan', true).map(row => row.id)).toEqual(['orphan']);
    expect(getReportBranches(clinics, 'removed', true)).toEqual([]);
  });

  it('limits active branch queries, retains their origin and rejects a partial set on failure', async () => {
    const branches = Array.from({ length: 7 }, (_, i) => clinic(String(i)));
    let active = 0;
    let peak = 0;
    const rows = await readBranchRows(branches, new AbortController().signal, async branch => {
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      --active;
      return [{ value: branch.code, BranchId: 'untrusted' }];
    });
    expect(peak).toBe(3);
    expect(rows.map(row => [row.BranchId, row.value])).toEqual(branches.map(row => [row.id, row.code]));

    const requests: AbortSignal[] = [];
    await expect(readBranchRows(branches, new AbortController().signal, async (branch, signal) => {
      requests.push(signal);
      if (branch.id === '1') throw new Error('Offline');
      return [];
    })).rejects.toThrow('Clinic: Offline');
    expect(requests.every(signal => signal.aborted)).toBe(true);
  });

  it('cancels in-flight requests and skips queued clinics when the selection changes', async () => {
    const controller = new AbortController();
    const started: string[] = [];
    const pending = readBranchRows(clinics, controller.signal, async (branch, signal) => {
      started.push(branch.id);
      await new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      return [];
    });
    controller.abort();
    await expect(pending).rejects.toHaveProperty('name', 'AbortError');
    expect(started).toEqual(['north', 'south', 'east']);
  });

  it('keeps two branches with the same invoice and customer distinct in both Excel reports', () => {
    const date = '2026-11-05T06:00:00Z';
    const order = (amount: number) => ({
      id: 'pk', order_id: 'SO-1', member_id: 'member', member: { name: 'Visitor', phonenumber: '099' },
      net_total: amount, total: amount, created_at: date, status: 'ACTIVE', payment_status: 'PAID',
      order_items: [{ id: 'svc', quantity: 1, price: amount, service: { name: 'Facial' } }],
      payments: [{ id: 'pay', payment_amount: amount, payment_method: 'CASH', payment_date: date }],
    });
    const branches = getReportBranches(clinics, 'north', true);
    const sales = branches.flatMap((branch, i) => labelBranchRows(branch, mapSalesDetailRecords([order(i ? 25.5 : 32000)])));
    for (const view of ['detailed', 'summary'] as const) {
      const display = buildSalesDetailDisplayRows(sales, view);
      expect(display.map(row => row.InvoiceNetTotal)).toEqual([32000, 25.5]);
      expect(buildSalesDetailExportRows(display).map(row => [row.Branch, row.Currency])).toEqual([
        ['Clinic · NORTH', 'MMK'], ['Clinic · SOUTH', 'USD'],
      ]);
    }
    const payments = branches.flatMap((branch, i) => labelBranchRows(branch, mapPaymentReportRecords(
      [order(i ? 25.5 : 32000)], new Date('2026-11-05T00:00:00Z'), new Date('2026-11-05T23:59:59Z'))));
    expect(formatReportTotal(payments, row => row.PaymentAmount, 'MMK')).toBe('32,000 MMK / 25.5 USD');
    const book = XLSX.read(XLSX.write(buildPaymentWorkbook(payments, 'MMK'), { type: 'buffer', bookType: 'xlsx' }));
    const summary = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets['Payment Summary']);
    expect(summary.filter(row => row['Payment Method'] === 'Grand Total').map(row => [row['Total Amount'], row.Currency]))
      .toEqual([[32000, 'MMK'], [25.5, 'USD']]);
    const detail = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets['Detailed Transactions']);
    expect(detail.map(row => [row.Branch, row.Currency, row['Paid Amount']])).toEqual([
      ['Clinic · NORTH', 'MMK', 32000], ['Clinic · SOUTH', 'USD', 25.5],
    ]);
  });
});
