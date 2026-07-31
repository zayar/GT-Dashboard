export interface PaymentReportRecord {
  PaymentMethod: string;
  PaymentAmount: number | string | null;
}

export interface PaymentMethodSummary {
  PaymentMethod: string;
  TotalAmount: number;
  TransactionCount: number;
}

export const normalizePaymentMethod = (value: string | null | undefined): string => (
  value?.trim().toUpperCase() || 'UNSPECIFIED'
);

export const parsePaymentAmount = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatPaymentMmk = (value: number | string | null | undefined): string => {
  const amount = parsePaymentAmount(value);
  if (amount === null) return '—';
  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })} MMK`;
};

export const summarizePaymentMethods = (records: PaymentReportRecord[]): PaymentMethodSummary[] => {
  const summaries = new Map<string, PaymentMethodSummary>();

  records.forEach((record) => {
    const method = normalizePaymentMethod(record.PaymentMethod);
    const amount = parsePaymentAmount(record.PaymentAmount) ?? 0;
    const current = summaries.get(method) ?? {
      PaymentMethod: method,
      TotalAmount: 0,
      TransactionCount: 0,
    };
    current.TotalAmount += amount;
    current.TransactionCount += 1;
    summaries.set(method, current);
  });

  return [...summaries.values()].sort((left, right) => right.TotalAmount - left.TotalAmount);
};

export const filterPaymentsByMethod = <T extends PaymentReportRecord>(
  records: T[],
  selectedMethods: string[],
): T[] => {
  if (selectedMethods.length === 0) return records;
  const normalizedSelections = new Set(selectedMethods.map(normalizePaymentMethod));
  return records.filter(record => normalizedSelections.has(normalizePaymentMethod(record.PaymentMethod)));
};
