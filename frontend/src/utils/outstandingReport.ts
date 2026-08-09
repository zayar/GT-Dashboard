import {
  OutstandingAgingBucket,
  OutstandingPaymentStatus,
  OutstandingReportRecord,
} from '../api/apicoreSalesReports';

export const OUTSTANDING_AGING_BUCKETS: OutstandingAgingBucket[] = [
  '0-30',
  '31-60',
  '61-90',
  '90+',
];

export interface OutstandingFilters {
  search: string;
  salesPerson: string;
  paymentStatus: 'ALL' | OutstandingPaymentStatus;
  agingBucket: 'ALL' | OutstandingAgingBucket;
}

export interface OutstandingTotals {
  invoiceCount: number;
  invoiceTotal: number;
  amountPaid: number;
  outstandingBalance: number;
  partialPaidBalance: number;
  unpaidBalance: number;
  agedOver30Balance: number;
}

export interface OutstandingBreakdown {
  label: string;
  invoiceCount: number;
  outstandingBalance: number;
}

export const filterOutstandingRecords = (
  records: OutstandingReportRecord[],
  filters: OutstandingFilters,
) => {
  const search = filters.search.trim().toLowerCase();

  return records.filter((record) => {
    if (
      filters.salesPerson !== 'ALL'
      && record.SalePerson !== filters.salesPerson
    ) {
      return false;
    }
    if (
      filters.paymentStatus !== 'ALL'
      && record.PaymentStatus !== filters.paymentStatus
    ) {
      return false;
    }
    if (
      filters.agingBucket !== 'ALL'
      && record.AgingBucket !== filters.agingBucket
    ) {
      return false;
    }
    if (!search) return true;

    return [
      record.InvoiceNumber,
      record.CustomerName,
      record.CustomerPhoneNumber,
      record.MemberId,
      record.SalePerson,
    ].some((value) => value.toLowerCase().includes(search));
  });
};

export const summarizeOutstandingRecords = (
  records: OutstandingReportRecord[],
): OutstandingTotals => records.reduce<OutstandingTotals>((totals, record) => ({
  invoiceCount: totals.invoiceCount + 1,
  invoiceTotal: totals.invoiceTotal + record.InvoiceTotal,
  amountPaid: totals.amountPaid + record.AmountPaid,
  outstandingBalance: totals.outstandingBalance + record.OutstandingBalance,
  partialPaidBalance: totals.partialPaidBalance
    + (record.PaymentStatus === 'PARTIAL_PAID' ? record.OutstandingBalance : 0),
  unpaidBalance: totals.unpaidBalance
    + (record.PaymentStatus === 'UNPAID' ? record.OutstandingBalance : 0),
  agedOver30Balance: totals.agedOver30Balance
    + (record.AgeDays > 30 ? record.OutstandingBalance : 0),
}), {
  invoiceCount: 0,
  invoiceTotal: 0,
  amountPaid: 0,
  outstandingBalance: 0,
  partialPaidBalance: 0,
  unpaidBalance: 0,
  agedOver30Balance: 0,
});

export const buildOutstandingBreakdown = (
  records: OutstandingReportRecord[],
  labelFor: (record: OutstandingReportRecord) => string,
): OutstandingBreakdown[] => {
  const groups = new Map<string, OutstandingBreakdown>();

  records.forEach((record) => {
    const label = labelFor(record) || 'Unknown';
    const current = groups.get(label) ?? {
      label,
      invoiceCount: 0,
      outstandingBalance: 0,
    };
    groups.set(label, {
      label,
      invoiceCount: current.invoiceCount + 1,
      outstandingBalance: current.outstandingBalance + record.OutstandingBalance,
    });
  });

  return Array.from(groups.values()).sort(
    (left, right) => right.outstandingBalance - left.outstandingBalance,
  );
};

export const buildAgingBreakdown = (
  records: OutstandingReportRecord[],
): OutstandingBreakdown[] => {
  const breakdown = buildOutstandingBreakdown(records, (record) => record.AgingBucket);

  return OUTSTANDING_AGING_BUCKETS.map((bucket) => (
    breakdown.find((entry) => entry.label === bucket) ?? {
      label: bucket,
      invoiceCount: 0,
      outstandingBalance: 0,
    }
  ));
};
