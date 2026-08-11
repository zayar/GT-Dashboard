export interface SalesBySalesPersonTransaction {
  Date: string;
  InvoiceNumber: string;
  CustomerName: string;
  CustomerPhoneNumber: string;
  ServiceName: string | null;
  ServicePackageName: string | null;
  PaymentMethod: string;
  PaymentStatus: string;
  SalesAmount: number;
  AmountPaid: number;
  OutstandingAmount: number;
  SellerName: string | null;
}

export interface SalesPersonSummary {
  salesPerson: string;
  transactionCount: number;
  paidSales: number;
  partialPaidSales: number;
  partialOutstandingSales: number;
  unpaidSales: number;
  totalAmount: number;
}

export interface SalesDetailSourceRecord {
  Date: string;
  InvoiceNumber: string;
  CustomerName: string;
  CustomerPhoneNumber: string;
  SalePerson: string;
  ServiceName: string | null;
  ServicePackageName: string | null;
  PaymentMethod: string;
  PaymentStatus: string;
  PaymentAmount?: number | null;
  InvoiceNetTotal: number;
}

export interface OutstandingInvoiceSourceRecord {
  InvoiceNumber: string;
  AmountPaid: number;
  OutstandingBalance: number;
  PaymentStatus: string;
}

const addDistinct = (values: Set<string>, value: string | null | undefined) => {
  const normalized = value?.trim();
  if (normalized) values.add(normalized);
};

/**
 * Sales Details can contain several item and payment rows for one invoice.
 * Collapse them to the invoice grain before assigning gross sales to a seller.
 */
export const buildSalesBySalesPersonTransactions = (
  records: SalesDetailSourceRecord[],
  outstandingRecords: OutstandingInvoiceSourceRecord[] = [],
): SalesBySalesPersonTransaction[] => {
  const outstandingByInvoice = new Map(
    outstandingRecords.map(record => [record.InvoiceNumber.trim(), record])
  );
  const invoices = new Map<string, {
    transaction: SalesBySalesPersonTransaction;
    services: Set<string>;
    packages: Set<string>;
    methods: Set<string>;
    paymentTotal: number;
  }>();

  records.forEach((record, index) => {
    const invoiceKey = record.InvoiceNumber?.trim() || `row-${index}`;
    let invoice = invoices.get(invoiceKey);

    if (!invoice) {
      invoice = {
        transaction: {
          Date: record.Date,
          InvoiceNumber: record.InvoiceNumber,
          CustomerName: record.CustomerName,
          CustomerPhoneNumber: record.CustomerPhoneNumber,
          ServiceName: null,
          ServicePackageName: null,
          PaymentMethod: record.PaymentMethod,
          PaymentStatus: record.PaymentStatus,
          SalesAmount: Number(record.InvoiceNetTotal) || 0,
          AmountPaid: 0,
          OutstandingAmount: 0,
          SellerName: record.SalePerson || null,
        },
        services: new Set<string>(),
        packages: new Set<string>(),
        methods: new Set<string>(),
        paymentTotal: 0,
      };
      invoices.set(invoiceKey, invoice);
    }

    addDistinct(invoice.services, record.ServiceName);
    addDistinct(invoice.packages, record.ServicePackageName);
    addDistinct(invoice.methods, record.PaymentMethod);
    invoice.paymentTotal += Number(record.PaymentAmount) || 0;
    if (!invoice.transaction.PaymentStatus && record.PaymentStatus) {
      invoice.transaction.PaymentStatus = record.PaymentStatus;
    }
    if (!invoice.transaction.SellerName && record.SalePerson) {
      invoice.transaction.SellerName = record.SalePerson;
    }
  });

  return Array.from(invoices.values())
    .map(({ transaction, services, packages, methods, paymentTotal }) => {
      const invoiceTotal = Number(transaction.SalesAmount) || 0;
      const outstandingRecord = outstandingByInvoice.get(transaction.InvoiceNumber.trim());
      const sourceStatus = transaction.PaymentStatus?.trim().toUpperCase();
      const amountPaid = outstandingRecord
        ? Math.min(invoiceTotal, Math.max(0, Number(outstandingRecord.AmountPaid) || 0))
        : sourceStatus === 'PAID'
          ? invoiceTotal
          : Math.min(invoiceTotal, Math.max(0, paymentTotal));
      const outstandingAmount = outstandingRecord
        ? Math.min(invoiceTotal, Math.max(0, Number(outstandingRecord.OutstandingBalance) || 0))
        : Math.max(0, invoiceTotal - amountPaid);
      const paymentStatus = outstandingRecord?.PaymentStatus?.trim().toUpperCase()
        || (sourceStatus === 'PAID'
          ? 'PAID'
          : amountPaid > 0
            ? 'PARTIAL_PAID'
            : sourceStatus || 'UNPAID');

      return {
        ...transaction,
        ServiceName: Array.from(services).join(', ') || null,
        ServicePackageName: Array.from(packages).join(', ') || null,
        PaymentMethod: Array.from(methods).join(', ') || transaction.PaymentMethod,
        PaymentStatus: paymentStatus,
        AmountPaid: amountPaid,
        OutstandingAmount: outstandingAmount,
      };
    })
    .sort((left, right) => (
      right.Date.localeCompare(left.Date)
      || right.InvoiceNumber.localeCompare(left.InvoiceNumber)
    ));
};

export const filterReportableSalesTransactions = (
  transactions: SalesBySalesPersonTransaction[]
) => transactions.filter(transaction => Number(transaction.SalesAmount) > 0);

export const summarizeSalesBySalesPerson = (
  transactions: SalesBySalesPersonTransaction[]
): SalesPersonSummary[] => {
  const totals = new Map<string, {
    count: number;
    paid: number;
    partialPaid: number;
    partialOutstanding: number;
    unpaid: number;
    total: number;
  }>();

  transactions.forEach(transaction => {
    const salesPerson = transaction.SellerName || 'Unknown';
    const current = totals.get(salesPerson) || {
      count: 0,
      paid: 0,
      partialPaid: 0,
      partialOutstanding: 0,
      unpaid: 0,
      total: 0,
    };
    const amount = Number(transaction.SalesAmount) || 0;
    const status = transaction.PaymentStatus?.trim().toUpperCase();

    totals.set(salesPerson, {
      count: current.count + 1,
      paid: current.paid + (status === 'PAID' ? amount : 0),
      partialPaid: current.partialPaid + (status === 'PARTIAL_PAID' ? transaction.AmountPaid : 0),
      partialOutstanding: current.partialOutstanding
        + (status === 'PARTIAL_PAID' ? transaction.OutstandingAmount : 0),
      unpaid: current.unpaid + (status === 'UNPAID' ? transaction.OutstandingAmount : 0),
      total: current.total + amount,
    });
  });

  return Array.from(totals.entries())
    .map(([salesPerson, data]) => ({
      salesPerson,
      transactionCount: data.count,
      paidSales: data.paid,
      partialPaidSales: data.partialPaid,
      partialOutstandingSales: data.partialOutstanding,
      unpaidSales: data.unpaid,
      totalAmount: data.total,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
};
