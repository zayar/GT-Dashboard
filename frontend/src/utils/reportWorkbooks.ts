import * as XLSX from 'xlsx';
import type { AppointmentRecord } from '../api/apicoreReports';
import type { PaymentReportRecord } from '../api/apicoreSalesReports';
import { formatAppointmentDateTime } from './checkInOutReport';
import { summarizePaymentMethods } from './paymentReport';

export function buildAppointmentWorkbook(records: AppointmentRecord[]) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['From (Myanmar Time)', 'To (Myanmar Time)', 'Service', 'Member', 'Phone', 'Practitioner', 'Status', 'Helper', 'Note'],
    ...records.map(row => [
      formatAppointmentDateTime(row.FromTime), formatAppointmentDateTime(row.ToTime),
      row.ServiceName, row.MemberName ?? '', row.MemberPhoneNumber ?? '', row.PractitionerName,
      row.status, row.HelperName ?? '', row.member_note ?? '',
    ]),
  ]);
  records.forEach((_, index) => { sheet[`E${index + 2}`].z = '@'; });
  sheet['!cols'] = [23, 23, 32, 26, 24, 26, 18, 24, 45].map(wch => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Appointments');
  return book;
}

export function buildPaymentWorkbook(records: PaymentReportRecord[], currency: string) {
  const methods = summarizePaymentMethods(records);
  const summary = XLSX.utils.aoa_to_sheet([
    ['Payment Method', 'Transaction Count', `Total Amount (${currency})`],
    ...methods.map(method => [method.PaymentMethod, method.TransactionCount, method.TotalAmount]),
    ['Grand Total', records.length, methods.reduce((total, row) => total + row.TotalAmount, 0)],
  ]);
  summary['!cols'] = [{ wch: 24 }, { wch: 22 }, { wch: 24 }];
  const hasOtherItems = records.some(row => row.OtherItems);
  const detail = XLSX.utils.aoa_to_sheet([
    ['Date', 'Invoice Number', 'Customer Name', 'Member ID', 'Sale Person', 'Service Name', 'Product Name',
      'Service Package', ...(hasOtherItems ? ['Other Items'] : []), 'Payment Method', 'Payment Status', 'Wallet', `Paid Amount (${currency})`],
    ...records.map(row => [
      row.Date, row.InvoiceNumber, row.CustomerName, row.MemberId, row.SalePerson, row.ServiceName,
      row.ProductName, row.ServicePackageName, ...(hasOtherItems ? [row.OtherItems] : []),
      row.PaymentMethod, row.PaymentStatus, row.WalletTopUp, row.PaymentAmount,
    ]),
  ]);
  detail['!cols'] = [15, 22, 28, 20, 24, 44, 44, 36, ...(hasOtherItems ? [32] : []), 20, 19, 15, 23].map(wch => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, summary, 'Payment Summary');
  XLSX.utils.book_append_sheet(book, detail, 'Detailed Transactions');
  return book;
}
