import * as XLSX from 'xlsx';
import type { AppointmentRecord } from '../api/apicoreReports';
import type { PaymentReportRecord } from '../api/apicoreSalesReports';
import { formatAppointmentDateTime } from './checkInOutReport';
import { currencyTotals, type BranchRow } from './reportBranches';
import { summarizeBranchPayments } from './paymentReport';

export function buildAppointmentWorkbook(records: (AppointmentRecord & { Branch?: string })[]) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['From (Myanmar Time)', 'To (Myanmar Time)', 'Service', 'Member', 'Phone', 'Practitioner', 'Status', 'Helper', 'Note', 'Branch'],
    ...records.map(row => [
      formatAppointmentDateTime(row.FromTime), formatAppointmentDateTime(row.ToTime),
      row.ServiceName, row.MemberName ?? '', row.MemberPhoneNumber ?? '', row.PractitionerName,
      row.status, row.HelperName ?? '', row.member_note ?? '', row.Branch ?? row.ClinicName,
    ]),
  ]);
  records.forEach((_, index) => { sheet[`E${index + 2}`].z = '@'; });
  sheet['!cols'] = [23, 23, 32, 26, 24, 26, 18, 24, 45, 28].map(wch => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Appointments');
  return book;
}

export function buildPaymentWorkbook(records: BranchRow<PaymentReportRecord>[], currency: string) {
  const methods = summarizeBranchPayments(records);
  const totals = currencyTotals(methods, method => method.TotalAmount);
  const unit = totals.length > 1 ? '' : ` (${totals[0]?.[0] ?? currency})`;
  const counts = new Map<string, number>();
  for (const method of methods) counts.set(method.Currency, (counts.get(method.Currency) ?? 0) + method.TransactionCount);
  const summary = XLSX.utils.aoa_to_sheet([
    ['Payment Method', 'Transaction Count', 'Total Amount' + unit, 'Branch', 'Currency'],
    ...methods.map(method => [method.PaymentMethod, method.TransactionCount, method.TotalAmount, method.Branch, method.Currency]),
    ...totals.map(([code, amount]) => ['Grand Total', counts.get(code), amount, '', code]),
  ]);
  summary['!cols'] = [24, 22, 24, 28, 14].map(wch => ({ wch }));
  const hasOtherItems = records.some(row => row.OtherItems);
  const detail = XLSX.utils.aoa_to_sheet([
    ['Date', 'Invoice Number', 'Customer Name', 'Member ID', 'Sale Person', 'Service Name', 'Product Name',
      'Service Package', ...(hasOtherItems ? ['Other Items'] : []), 'Payment Method', 'Payment Status', 'Wallet', 'Paid Amount' + unit, 'Branch', 'Currency'],
    ...records.map(row => [
      row.Date, row.InvoiceNumber, row.CustomerName, row.MemberId, row.SalePerson, row.ServiceName,
      row.ProductName, row.ServicePackageName, ...(hasOtherItems ? [row.OtherItems] : []),
      row.PaymentMethod, row.PaymentStatus, row.WalletTopUp, row.PaymentAmount, row.Branch, row.Currency,
    ]),
  ]);
  detail['!cols'] = [15, 22, 28, 20, 24, 44, 44, 36, ...(hasOtherItems ? [32] : []), 20, 19, 15, 23, 28, 14].map(wch => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, summary, 'Payment Summary');
  XLSX.utils.book_append_sheet(book, detail, 'Detailed Transactions');
  return book;
}
