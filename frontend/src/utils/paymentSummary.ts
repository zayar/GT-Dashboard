export interface CustomerPaymentSummaryRecord {
  invoiceNumber?: string | null;
  method?: string | null;
  amount?: number | string | null;
}

export interface PaymentMethodSummary {
  method: string;
  count: number;
  total: number;
}

export interface CustomerPaymentSummary {
  totalSpent: number;
  invoiceCount: number;
  paymentMethods: PaymentMethodSummary[];
}

export type InvoiceDisplayRow<T> = T & {
  isFirstInvoiceRow: boolean;
};

const normalizeInvoiceKey = (invoiceNumber: CustomerPaymentSummaryRecord['invoiceNumber']): string | null => {
  const key = String(invoiceNumber || '').trim();
  return key.length > 0 ? key : null;
};

const normalizeAmount = (amount: CustomerPaymentSummaryRecord['amount']): number => {
  const value = Number(amount || 0);
  return Number.isFinite(value) ? value : 0;
};

export const calculateCustomerPaymentSummary = (
  payments: CustomerPaymentSummaryRecord[]
): CustomerPaymentSummary => {
  const invoices = new Map<string, { method: string; amount: number }>();

  payments.forEach((payment, index) => {
    const invoiceKey = normalizeInvoiceKey(payment.invoiceNumber) || `__missing_invoice_${index}`;

    if (invoices.has(invoiceKey)) {
      return;
    }

    invoices.set(invoiceKey, {
      method: payment.method || 'Unknown',
      amount: normalizeAmount(payment.amount),
    });
  });

  const methodGroups: Record<string, PaymentMethodSummary> = {};
  let totalSpent = 0;

  invoices.forEach(({ method, amount }) => {
    if (!methodGroups[method]) {
      methodGroups[method] = { method, count: 0, total: 0 };
    }

    methodGroups[method].count += 1;
    methodGroups[method].total += amount;

    if (method !== 'PASS') {
      totalSpent += amount;
    }
  });

  return {
    totalSpent,
    invoiceCount: invoices.size,
    paymentMethods: Object.values(methodGroups),
  };
};

export const markFirstInvoiceRows = <T extends { invoiceNumber?: string | null }>(
  payments: T[]
): InvoiceDisplayRow<T>[] => {
  const seenInvoices = new Set<string>();

  return payments.map((payment) => {
    const invoiceKey = normalizeInvoiceKey(payment.invoiceNumber);

    if (!invoiceKey) {
      return { ...payment, isFirstInvoiceRow: true };
    }

    const isFirstInvoiceRow = !seenInvoices.has(invoiceKey);
    seenInvoices.add(invoiceKey);

    return { ...payment, isFirstInvoiceRow };
  });
};
