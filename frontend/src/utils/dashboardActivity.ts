import { format } from 'date-fns';
import { fetchWarehouseRows } from '../api/warehouseReport';
import type { CanonicalMetricPeriodRanges } from './canonicalSalesMetrics';
import { escapeSqlString } from './directoryQueries';

export function percentageChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

interface ActivityRow {
  period: 'current' | 'previous';
  customers: number;
  appointments: number;
  services: number;
}

export async function loadDashboardActivity(code: string, ranges: CanonicalMetricPeriodRanges, signal: AbortSignal) {
  const dateFilter = ({ startDate, endDate }: typeof ranges.current) => (
    `DATE(CheckInTime) BETWEEN DATE('${format(startDate, 'yyyy-MM-dd')}') AND DATE('${format(endDate, 'yyyy-MM-dd')}')`
  );
  const current = dateFilter(ranges.current);
  const previous = dateFilter(ranges.previous);
  const rows = await fetchWarehouseRows<ActivityRow>(`
    SELECT IF(${current}, 'current', 'previous') AS period,
      COUNT(DISTINCT CustomerName) AS customers,
      COUNT(DISTINCT BookingID) AS appointments,
      COUNT(DISTINCT ServiceName) AS services
    FROM great_time.MainDataView
    WHERE LOWER(ClinicCode) = LOWER('${escapeSqlString(code)}') AND ((${current}) OR (${previous}))
    GROUP BY period
  `, signal);
  const totals = (period: ActivityRow['period']) => {
    const row = rows.find(entry => entry.period === period);
    const customers = Number(row?.customers ?? 0);
    return {
      customers,
      appointmentsPerCustomer: customers ? Number(row?.appointments) / customers : 0,
      services: Number(row?.services ?? 0),
    };
  };
  return { current: totals('current'), previous: totals('previous') };
}
