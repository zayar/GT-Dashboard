export interface CustomerPaymentRecord {
  invoiceNumber?: string | null;
  date?: string | null;
  method?: string | null;
  invoiceTotal?: number | string | null;
  paymentAmount?: number | string | null;
  status?: string | null;
  ServiceName?: string | null;
  ServicePackageName?: string | null;
  SellerName?: string | null;
}

export interface PaymentMethodSummary {
  method: string;
  count: number;
  total: number;
}

export interface CustomerPaymentSummary {
  mmkSpent: number;
  passSpent: number;
  topUpSpent: number;
  mmkInvoiceCount: number;
  passInvoiceCount: number;
  unallocatedInvoiceCount: number;
  paymentMethods: PaymentMethodSummary[];
}

export type CustomerPaymentDisplayRow<T> = T & {
  method: string;
  invoiceTotal: number;
  displayAmount: number | null;
  topUpAmount: number | null;
  isTopUp: boolean;
};

const amountValue = (value: number | string | null | undefined): number => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

const paymentMethod = (method: string | null | undefined): string =>
  method?.trim().toUpperCase() || 'UNKNOWN';

const isPaid = (status: string | null | undefined, paymentAmount: number | string | null | undefined): boolean => {
  const normalized = status?.trim().toUpperCase();
  return normalized === 'PAID' || normalized === 'PARTIAL_PAID' || (!normalized && amountValue(paymentAmount) > 0);
};

export const isTopUpInvoice = (invoiceNumber: string | null | undefined): boolean =>
  /^TO-/i.test(invoiceNumber?.trim() || '');

/** MainPaymentView repeats invoice totals across service lines. Retain those
 * lines while counting each distinct method/amount combination once. */
export function buildCustomerPaymentBreakdown<T extends CustomerPaymentRecord>(payments: T[]) {
  const groups = new Map<string, {
    method: string;
    invoiceNumber: string;
    invoiceTotal: number;
    paymentAmounts: Set<number>;
    hasPaymentAmount: boolean;
    isTopUp: boolean;
  }>();
  const invoiceHasPayment = new Set<string>();
  const validRows = payments.filter((payment) =>
    isPaid(payment.status, payment.paymentAmount) && (amountValue(payment.invoiceTotal) > 0 || amountValue(payment.paymentAmount) > 0)
  );

  validRows.forEach((payment, index) => {
    const invoiceNumber = payment.invoiceNumber?.trim() || `Unknown invoice ${index + 1}`;
    const method = paymentMethod(payment.method);
    const key = `${invoiceNumber}\u0000${method}`;
    const group = groups.get(key) || {
      method,
      invoiceNumber,
      invoiceTotal: 0,
      paymentAmounts: new Set<number>(),
      hasPaymentAmount: false,
      isTopUp: isTopUpInvoice(invoiceNumber),
    };
    group.invoiceTotal = Math.max(group.invoiceTotal, amountValue(payment.invoiceTotal));
    const paid = amountValue(payment.paymentAmount);
    if (paid > 0) {
      group.paymentAmounts.add(paid);
      group.hasPaymentAmount = true;
      invoiceHasPayment.add(invoiceNumber);
    }
    groups.set(key, group);
  });

  const groupsPerInvoice = new Map<string, number>();
  groups.forEach((group) => groupsPerInvoice.set(group.invoiceNumber, (groupsPerInvoice.get(group.invoiceNumber) || 0) + 1));
  const unallocatedInvoices = new Set<string>();
  const firstGroupByInvoice = new Set<string>();
  const groupAmounts = new Map<string, number>();
  groups.forEach((group, key) => {
    if (group.hasPaymentAmount) {
      groupAmounts.set(key, Array.from(group.paymentAmounts).reduce((sum, amount) => sum + amount, 0));
    } else if (!invoiceHasPayment.has(group.invoiceNumber)
      && (groupsPerInvoice.get(group.invoiceNumber) || 0) === 1
      && group.method !== 'SPLIT' && group.method !== 'MIXED'
      && !firstGroupByInvoice.has(group.invoiceNumber)) {
      // Legacy invoices can lack payment rows. Use their invoice total once.
      groupAmounts.set(key, group.invoiceTotal);
      firstGroupByInvoice.add(group.invoiceNumber);
    } else {
      groupAmounts.set(key, 0);
      if (!invoiceHasPayment.has(group.invoiceNumber)) unallocatedInvoices.add(group.invoiceNumber);
    }
  });

  const summary: CustomerPaymentSummary = {
    mmkSpent: 0,
    passSpent: 0,
    topUpSpent: 0,
    mmkInvoiceCount: 0,
    passInvoiceCount: 0,
    unallocatedInvoiceCount: unallocatedInvoices.size,
    paymentMethods: [],
  };
  const mmkInvoices = new Set<string>();
  const passInvoices = new Set<string>();
  const methodGroups = new Map<string, PaymentMethodSummary>();

  groups.forEach((group, key) => {
    const amount = groupAmounts.get(key) || 0;
    if (amount <= 0) return;
    if (group.method === 'PASS') {
      summary.passSpent += amount;
      passInvoices.add(group.invoiceNumber);
      return;
    }
    summary.mmkSpent += amount;
    if (group.isTopUp) summary.topUpSpent += amount;
    mmkInvoices.add(group.invoiceNumber);
    const methodSummary = methodGroups.get(group.method) || { method: group.method, count: 0, total: 0 };
    methodSummary.count += 1;
    methodSummary.total += amount;
    methodGroups.set(group.method, methodSummary);
  });
  summary.mmkInvoiceCount = mmkInvoices.size;
  summary.passInvoiceCount = passInvoices.size;
  summary.paymentMethods = Array.from(methodGroups.values());

  const seenGroups = new Set<string>();
  const mmkRows: CustomerPaymentDisplayRow<T>[] = [];
  const passRows: CustomerPaymentDisplayRow<T>[] = [];
  validRows.forEach((payment, index) => {
    const invoiceNumber = payment.invoiceNumber?.trim() || `Unknown invoice ${index + 1}`;
    const method = paymentMethod(payment.method);
    const key = `${invoiceNumber}\u0000${method}`;
    const group = groups.get(key)!;
    const amount = groupAmounts.get(key) || 0;
    const first = !seenGroups.has(key);
    seenGroups.add(key);
    const displayAmount = first && amount > 0 ? amount : null;
    const row = {
      ...payment,
      method,
      invoiceTotal: group.invoiceTotal,
      displayAmount,
      topUpAmount: group.isTopUp && method !== 'PASS' ? displayAmount : null,
      isTopUp: group.isTopUp,
    };
    (method === 'PASS' ? passRows : mmkRows).push(row);
  });

  return { mmkRows, passRows, summary };
}
