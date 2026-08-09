import type {
  OutstandingReportRecord,
  PaymentReportRecord,
  SalesDetailRecord,
} from '../api/apicoreSalesReports';
import {
  buildSalesBySalesPersonTransactions,
  filterReportableSalesTransactions,
} from './salesBySalesPerson';

export const CANONICAL_SALES_METRICS = {
  grossSales: {
    label: 'Gross Sales',
    description: 'Full invoice value by order date, including paid, partial-paid, and unpaid invoices.',
    dateBasis: 'Order date',
  },
  paymentsReceived: {
    label: 'Payments Received',
    description: 'Actual non-PASS payment amounts received during the selected payment-date range.',
    dateBasis: 'Payment date',
  },
  outstandingBalance: {
    label: 'Outstanding Balance',
    description: 'Active invoice value less payments posted through the selected as-of date.',
    dateBasis: 'As-of date',
  },
} as const;

export interface CanonicalActivityMetrics {
  grossSales: number;
  paymentsReceived: number;
  invoiceCount: number;
  paymentCount: number;
}

export interface CanonicalSalesMetrics extends CanonicalActivityMetrics {
  outstandingBalance: number;
  outstandingInvoiceCount: number;
  partialPaidBalance: number;
  unpaidBalance: number;
}

export const EMPTY_CANONICAL_SALES_METRICS: CanonicalSalesMetrics = {
  grossSales: 0,
  paymentsReceived: 0,
  outstandingBalance: 0,
  invoiceCount: 0,
  paymentCount: 0,
  outstandingInvoiceCount: 0,
  partialPaidBalance: 0,
  unpaidBalance: 0,
};

export const summarizeCanonicalActivityMetrics = (
  salesRecords: SalesDetailRecord[],
  paymentRecords: PaymentReportRecord[],
): CanonicalActivityMetrics => {
  const invoices = filterReportableSalesTransactions(
    buildSalesBySalesPersonTransactions(salesRecords),
  );

  return {
    grossSales: invoices.reduce((sum, invoice) => sum + invoice.SalesAmount, 0),
    paymentsReceived: paymentRecords.reduce(
      (sum, payment) => sum + (Number(payment.PaymentAmount) || 0),
      0,
    ),
    invoiceCount: invoices.length,
    paymentCount: paymentRecords.length,
  };
};

export const summarizeCanonicalSalesMetrics = (
  salesRecords: SalesDetailRecord[],
  paymentRecords: PaymentReportRecord[],
  outstandingRecords: OutstandingReportRecord[],
): CanonicalSalesMetrics => {
  const activity = summarizeCanonicalActivityMetrics(salesRecords, paymentRecords);

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

export type CanonicalMetricPeriod = 'monthly' | 'weekly' | 'annual';

export interface CanonicalMetricWindow {
  startDate: Date;
  endDate: Date;
}

export interface CanonicalMetricPeriodRanges {
  current: CanonicalMetricWindow;
  previous: CanonicalMetricWindow;
  comparisonLabel: string;
}

const startOfDay = (value: Date) => new Date(
  value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0,
);

const endOfDay = (value: Date) => new Date(
  value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999,
);

const daysInMonth = (year: number, month: number) => (
  new Date(year, month + 1, 0).getDate()
);

export const resolveCanonicalMetricPeriodRanges = (
  period: CanonicalMetricPeriod,
  now = new Date(),
): CanonicalMetricPeriodRanges => {
  if (period === 'weekly') {
    const currentEnd = endOfDay(now);
    const currentStart = startOfDay(new Date(
      now.getFullYear(), now.getMonth(), now.getDate() - 6,
    ));
    const previousEnd = endOfDay(new Date(
      currentStart.getFullYear(), currentStart.getMonth(), currentStart.getDate() - 1,
    ));
    const previousStart = startOfDay(new Date(
      previousEnd.getFullYear(), previousEnd.getMonth(), previousEnd.getDate() - 6,
    ));

    return {
      current: { startDate: currentStart, endDate: currentEnd },
      previous: { startDate: previousStart, endDate: previousEnd },
      comparisonLabel: 'vs previous 7 days',
    };
  }

  if (period === 'annual') {
    const previousYear = now.getFullYear() - 1;
    const previousDay = Math.min(now.getDate(), daysInMonth(previousYear, now.getMonth()));

    return {
      current: {
        startDate: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
        endDate: endOfDay(now),
      },
      previous: {
        startDate: new Date(previousYear, 0, 1, 0, 0, 0, 0),
        endDate: new Date(previousYear, now.getMonth(), previousDay, 23, 59, 59, 999),
      },
      comparisonLabel: `vs same period ${previousYear}`,
    };
  }

  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousYear = previousMonthDate.getFullYear();
  const previousMonth = previousMonthDate.getMonth();
  const previousDay = Math.min(now.getDate(), daysInMonth(previousYear, previousMonth));

  return {
    current: {
      startDate: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      endDate: endOfDay(now),
    },
    previous: {
      startDate: new Date(previousYear, previousMonth, 1, 0, 0, 0, 0),
      endDate: new Date(previousYear, previousMonth, previousDay, 23, 59, 59, 999),
    },
    comparisonLabel: 'vs same days last month',
  };
};
