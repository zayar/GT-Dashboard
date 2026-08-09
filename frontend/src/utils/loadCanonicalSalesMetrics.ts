import {
  fetchOutstandingReportRecords,
  fetchPaymentReportRecords,
  fetchSalesDetailRecords,
} from '../api/apicoreSalesReports';
import {
  CanonicalActivityMetrics,
  CanonicalSalesMetrics,
  summarizeCanonicalActivityMetrics,
} from './canonicalSalesMetrics';

interface CanonicalActivityInput {
  clinicId: string;
  startDate: Date;
  endDate: Date;
  accessToken: string;
}

interface CanonicalSalesInput extends CanonicalActivityInput {
  asOfDate?: Date;
}

export const loadCanonicalActivityMetrics = async (
  input: CanonicalActivityInput,
): Promise<CanonicalActivityMetrics> => {
  const reportInput = {
    clinicId: input.clinicId,
    filterType: 'day' as const,
    startDate: input.startDate,
    endDate: input.endDate,
    selectedDate: null,
    accessToken: input.accessToken,
  };
  const [salesRecords, paymentRecords] = await Promise.all([
    fetchSalesDetailRecords(reportInput),
    fetchPaymentReportRecords(reportInput),
  ]);

  return summarizeCanonicalActivityMetrics(salesRecords, paymentRecords);
};

export const loadCanonicalSalesMetrics = async (
  input: CanonicalSalesInput,
): Promise<CanonicalSalesMetrics> => {
  const [activity, outstandingRecords] = await Promise.all([
    loadCanonicalActivityMetrics(input),
    fetchOutstandingReportRecords({
      clinicId: input.clinicId,
      asOfDate: input.asOfDate ?? input.endDate,
      accessToken: input.accessToken,
    }),
  ]);

  return outstandingRecords.reduce<CanonicalSalesMetrics>((totals, record) => ({
    ...totals,
    outstandingBalance: totals.outstandingBalance + record.OutstandingBalance,
    outstandingInvoiceCount: totals.outstandingInvoiceCount + 1,
    partialPaidBalance: totals.partialPaidBalance
      + (record.PaymentStatus === 'PARTIAL_PAID' ? record.OutstandingBalance : 0),
    unpaidBalance: totals.unpaidBalance
      + (record.PaymentStatus === 'UNPAID' ? record.OutstandingBalance : 0),
  }), {
    ...activity,
    outstandingBalance: 0,
    outstandingInvoiceCount: 0,
    partialPaidBalance: 0,
    unpaidBalance: 0,
  });
};
