import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import type { AppointmentRecord } from '../api/apicoreReports';
import { mapPaymentReportRecords } from '../api/apicoreSalesReports';
import { labelBranchRows } from './reportBranches';
import { filterPaymentsByMethod } from './paymentReport';
import { buildAppointmentWorkbook, buildPaymentWorkbook } from './reportWorkbooks';

function reopen(book: XLSX.WorkBook) {
  return XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true });
}

const branch = { id: 'a', code: 'A', name: 'Branch A', active: 1, logo: '' };
const appointment: AppointmentRecord = {
  bookingid: 'internal-booking-key', ClinicCode: 'A', ClinicID: 'clinic-a', ClinicName: 'A',
  FromTime: '2026-11-05T07:00:00Z', ToTime: '2026-11-05T08:00:00Z', ServiceName: 'Facial',
  MemberName: 'စမ်းသပ်', MemberPhoneNumber: '095020584', PractitionerName: 'Staff',
  status: 'CHECKOUT', HelperName: null, member_note: 'Quote " and comma,',
};

describe('Excel report downloads', () => {
  it('round-trips phone numbers as text, including leading zeros, plus signs and long numbers', () => {
    const phones = ['095020584', '+959880543768', '95020584', '001234567890123456789', ''];
    const book = reopen(buildAppointmentWorkbook(phones.map(phone => ({ ...appointment, MemberPhoneNumber: phone }))));
    const sheet = book.Sheets.Appointments;
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    expect(rows[0]).not.toContain('Booking ID');
    expect(JSON.stringify(rows)).not.toContain(appointment.bookingid);
    expect(rows[1]).toContain('စမ်းသပ်');
    phones.forEach((phone, i) => {
      expect(sheet[`E${i + 2}`]).toMatchObject({ t: 's', v: phone, z: '@' });
    });
  });

  it('keeps two sheets in one file and reconciles filtered receipts without duplicating mixed line items', () => {
    const order = {
      id: 'order-pk', order_id: 'SO-1', member_id: 'internal-member-key', created_at: '2026-11-05T01:00:00Z',
      member: { name: 'Anyone', member_id: '  ', phonenumber: '+959123', clinic_members: [{ member_id: '' }] },
      payments: [
        { id: 'p1', payment_method: 'CASH', payment_amount: 75.5, payment_date: '2026-11-05T01:00:00Z' },
        { id: 'p2', payment_method: 'CARD', payment_amount: 20, payment_date: '2026-11-05T01:02:00Z' },
      ],
      order_items: [
        { id: 'i1', quantity: 1, service: { name: 'မျက်နှာ' } },
        { id: 'i2', quantity: 1, service: { name: 'Body Massage' } },
        { id: 'i3', quantity: 1, service: { name: 'Body Massage' } },
        { id: 'i4', quantity: 2, product_stock_item: { name: 'Aloe Vera Cream' } },
        { id: 'i5', quantity: 1, service_package: { name: 'Starter Package' } },
        { id: 'i6', quantity: 1, product_stock_item_id: 'old-product', metadata: '{"name":"Archived, serum"}' },
        { id: 'i7', quantity: 1, metadata: '{"name":"Legacy line"}' },
      ],
    };
    const rows = mapPaymentReportRecords([order], new Date(2026, 10, 5), new Date(2026, 10, 5, 23, 59, 59));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ CustomerPhoneNumber: '+959123', MemberId: '', ProductName: 'Aloe Vera Cream, Archived, serum' });
    const book = reopen(buildPaymentWorkbook(labelBranchRows(branch, filterPaymentsByMethod(rows, ['CASH'])), 'MMK'));
    expect(book.SheetNames).toEqual(['Payment Summary', 'Detailed Transactions']);
    const [detail] = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets['Detailed Transactions'], { defval: '' });
    expect(detail).toMatchObject({
      'Customer Name': 'Anyone', 'Member ID': '', 'Service Name': 'မျက်နှာ, Body Massage',
      'Product Name': 'Aloe Vera Cream, Archived, serum', 'Service Package': 'Starter Package', 'Other Items': 'Legacy line',
      'Paid Amount (MMK)': 75.5,
    });
    expect(JSON.stringify(detail)).not.toMatch(/Â·|internal-member-key/);
    expect(XLSX.utils.sheet_to_json(book.Sheets['Payment Summary'], { header: 1 })).toEqual([
      ['Payment Method', 'Transaction Count', 'Total Amount (MMK)', 'Branch', 'Currency'],
      ['CASH', 1, 75.5, 'Branch A', 'MMK'], ['Grand Total', 1, 75.5, '', 'MMK'],
    ]);
    const assigned = mapPaymentReportRecords([{ ...order, member: { ...order.member, clinic_members: [{ member_id: '၀၀၂' }] } }],
      new Date(2026, 10, 5), new Date(2026, 10, 5, 23, 59, 59));
    expect(reopen(buildPaymentWorkbook(labelBranchRows(branch, assigned), 'MMK')).Sheets['Detailed Transactions'].D2).toMatchObject({ t: 's', v: '၀၀၂' });
  });
});
