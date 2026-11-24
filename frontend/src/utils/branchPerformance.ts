export interface BranchMetrics {
  appointments: number;
  completedServices: number;
  invoiceCount: number;
  grossSales: number;
  paymentsReceived: number;
}

export interface BranchPerformanceRow extends BranchMetrics {
  clinicId: string;
  clinicName: string;
  currency: string;
}

export function branchTotals(rows: BranchPerformanceRow[]) {
  const empty = () => ({ appointments: 0, completedServices: 0, invoiceCount: 0, grossSales: 0, paymentsReceived: 0 });
  const all = { appointments: 0, completedServices: 0, invoiceCount: 0 };
  const currencies = new Map<string, BranchMetrics>();
  for (const row of rows) {
    const subtotal = currencies.get(row.currency) ?? empty();
    subtotal.appointments += row.appointments;
    subtotal.completedServices += row.completedServices;
    subtotal.invoiceCount += row.invoiceCount;
    subtotal.grossSales += row.grossSales;
    subtotal.paymentsReceived += row.paymentsReceived;
    currencies.set(row.currency, subtotal);
    all.appointments += row.appointments;
    all.completedServices += row.completedServices;
    all.invoiceCount += row.invoiceCount;
  }
  return { all, currencies };
}
