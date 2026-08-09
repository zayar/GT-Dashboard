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
  SellerName: string | null;
}

export interface SalesPersonSummary {
  salesPerson: string;
  transactionCount: number;
  paidSales: number;
  partialPaidSales: number;
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
  InvoiceNetTotal: number;
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
  records: SalesDetailSourceRecord[]
): SalesBySalesPersonTransaction[] => {
  const invoices = new Map<string, {
    transaction: SalesBySalesPersonTransaction;
    services: Set<string>;
    packages: Set<string>;
    methods: Set<string>;
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
          SellerName: record.SalePerson || null,
        },
        services: new Set<string>(),
        packages: new Set<string>(),
        methods: new Set<string>(),
      };
      invoices.set(invoiceKey, invoice);
    }

    addDistinct(invoice.services, record.ServiceName);
    addDistinct(invoice.packages, record.ServicePackageName);
    addDistinct(invoice.methods, record.PaymentMethod);
    if (!invoice.transaction.PaymentStatus && record.PaymentStatus) {
      invoice.transaction.PaymentStatus = record.PaymentStatus;
    }
    if (!invoice.transaction.SellerName && record.SalePerson) {
      invoice.transaction.SellerName = record.SalePerson;
    }
  });

  return Array.from(invoices.values())
    .map(({ transaction, services, packages, methods }) => ({
      ...transaction,
      ServiceName: Array.from(services).join(', ') || null,
      ServicePackageName: Array.from(packages).join(', ') || null,
      PaymentMethod: Array.from(methods).join(', ') || transaction.PaymentMethod,
    }))
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
    unpaid: number;
    total: number;
  }>();

  transactions.forEach(transaction => {
    const salesPerson = transaction.SellerName || 'Unknown';
    const current = totals.get(salesPerson) || {
      count: 0,
      paid: 0,
      partialPaid: 0,
      unpaid: 0,
      total: 0,
    };
    const amount = Number(transaction.SalesAmount) || 0;
    const status = transaction.PaymentStatus?.trim().toUpperCase();

    totals.set(salesPerson, {
      count: current.count + 1,
      paid: current.paid + (status === 'PAID' ? amount : 0),
      partialPaid: current.partialPaid + (status === 'PARTIAL_PAID' ? amount : 0),
      unpaid: current.unpaid + (status === 'UNPAID' ? amount : 0),
      total: current.total + amount,
    });
  });

  return Array.from(totals.entries())
    .map(([salesPerson, data]) => ({
      salesPerson,
      transactionCount: data.count,
      paidSales: data.paid,
      partialPaidSales: data.partialPaid,
      unpaidSales: data.unpaid,
      totalAmount: data.total,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
};
