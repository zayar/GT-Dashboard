import { useCallback } from 'react';
import { endOfDay, startOfDay } from 'date-fns';
import { postApicoreGraphql, toMyanmarUtcIso } from '../api/apicoreReports';
import { useAuth } from '../contexts/AuthContext';
import type { CanonicalActivityMetrics } from '../utils/canonicalSalesMetrics';
import { useReportSection } from './useReportSection';

const ACTIVITY = `
  query BiAccountingActivity($clinicId: String!, $startDate: DateTime!, $endDate: DateTime!) {
    biAccountingActivity(clinicId: $clinicId, startDate: $startDate, endDate: $endDate) {
      grossSales invoiceCount paymentsReceived paymentCount
    }
  }`;

async function requireToken(getAccessToken: () => Promise<string | null>) {
  const token = await getAccessToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return token;
}

export function useBiActivity(clinicId: string | undefined, start: Date, end: Date, refresh = 0) {
  const { getAccessToken } = useAuth();
  const startDate = toMyanmarUtcIso(startOfDay(start));
  const endDate = toMyanmarUtcIso(endOfDay(end));
  const load = useCallback(async (signal: AbortSignal) => {
    const data = await postApicoreGraphql<{ biAccountingActivity: CanonicalActivityMetrics }>({
      query: ACTIVITY, variables: { clinicId, startDate, endDate },
      accessToken: await requireToken(getAccessToken), signal,
    });
    if (!data.biAccountingActivity) throw new Error('The accounting service did not return totals.');
    return data.biAccountingActivity;
  }, [clinicId, startDate, endDate, getAccessToken]);
  return useReportSection(clinicId ? load : null, refresh);
}
