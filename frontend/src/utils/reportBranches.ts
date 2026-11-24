import type { ReportClinic } from './clinicBranches';
import { formatCurrencyAmount, getCurrency } from './currency';

export interface ReportBranch {
  BranchId: string;
  Branch: string;
  Currency: string;
}

export type BranchRow<T> = T & ReportBranch;

export const branchReportPaths = new Set([
  '/appointments-list', '/checkin-checkout-page', '/daily-report', '/customer-service-activity-report',
  '/payment-details', '/banking-details', '/outstanding-receivables', '/sales-by-sales-person', '/customers-by-salesperson',
]);

export function branchKey(branchId: string | undefined, value: string) {
  return JSON.stringify([branchId, value]);
}

export function branchDetailPath(path: string, branchId?: string) {
  return branchId ? path + '?branch=' + encodeURIComponent(branchId) : path;
}

export function labelBranchRows<T>(clinic: ReportClinic, rows: T[]): BranchRow<T>[] {
  const branch = { BranchId: clinic.id, Branch: clinic.reportName || clinic.name || clinic.code, Currency: getCurrency(clinic) };
  return rows.map(row => ({ ...row, ...branch }));
}

// Limit concurrent paginated requests and publish only a complete set of branches.
export async function readBranchReports<T>(
  clinics: ReportClinic[], signal: AbortSignal, read: (clinic: ReportClinic, signal: AbortSignal) => Promise<T>,
): Promise<T[]> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) abort();
  signal.addEventListener('abort', abort, { once: true });
  let index = 0;
  const results: T[] = [];
  async function worker() {
    while (index < clinics.length) {
      controller.signal.throwIfAborted();
      const position = index++;
      const clinic = clinics[position];
      try {
        results[position] = await read(clinic, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        abort();
        throw new Error((clinic.reportName || clinic.name) + ': ' + (error instanceof Error ? error.message : 'Unable to load report.'));
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(3, clinics.length) }, worker));
    signal.throwIfAborted();
    return results;
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

export async function readBranchRows<T>(
  clinics: ReportClinic[], signal: AbortSignal, read: (clinic: ReportClinic, signal: AbortSignal) => Promise<T[]>,
): Promise<BranchRow<T>[]> {
  return (await readBranchReports(clinics, signal, async (clinic, requestSignal) =>
    labelBranchRows(clinic, await read(clinic, requestSignal)))).flat();
}

export function groupByBranch<T extends ReportBranch>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.BranchId);
    if (group) group.push(row);
    else groups.set(row.BranchId, [row]);
  }
  return [...groups.values()];
}

export function currencyTotals<T extends { Currency: string }>(rows: T[], amount: (row: T) => number) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.Currency, (totals.get(row.Currency) ?? 0) + amount(row));
  return [...totals].sort(([left], [right]) => left.localeCompare(right));
}

export function formatReportTotal<T extends { Currency: string }>(
  rows: T[], amount: (row: T) => number, fallbackCurrency: string,
) {
  const totals = currencyTotals(rows, amount);
  return totals.length
    ? totals.map(([currency, value]) => formatCurrencyAmount(value, currency)).join(' / ')
    : formatCurrencyAmount(0, fallbackCurrency);
}
