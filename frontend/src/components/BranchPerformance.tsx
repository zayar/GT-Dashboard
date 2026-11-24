import { useCallback, useState } from 'react';
import {
  Alert, Box, Button, LinearProgress, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableFooter, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { postApicoreGraphql } from '../api/apicoreReports';
import { useAuth } from '../contexts/AuthContext';
import { useClinic } from '../contexts/ClinicContext';
import { useReportSection } from '../hooks/useReportSection';
import { branchTotals, type BranchMetrics, type BranchPerformanceRow } from '../utils/branchPerformance';

const QUERY = `
  query BiBranchPerformance($companyId: String!, $startDay: String!, $endDay: String!) {
    biBranchPerformance(companyId: $companyId, startDay: $startDay, endDay: $endDay) {
      clinicId clinicName currency appointments completedServices invoiceCount grossSales paymentsReceived
    }
  }
`;

function myanmarToday() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Yangon',
  }).format(new Date());
}

function MetricCells({ metrics, currency }: { metrics: Pick<BranchMetrics, 'appointments' | 'completedServices' | 'invoiceCount'> & Partial<BranchMetrics>; currency?: string }) {
  const money = (amount?: number) => currency && amount !== undefined ? `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}` : '—';
  return <>
    <TableCell align="right">{metrics.appointments.toLocaleString()}</TableCell>
    <TableCell align="right">{metrics.completedServices.toLocaleString()}</TableCell>
    <TableCell align="right">{metrics.invoiceCount.toLocaleString()}</TableCell>
    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(metrics.grossSales)}</TableCell>
    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(metrics.paymentsReceived)}</TableCell>
  </>;
}

export default function BranchPerformance() {
  const { currentClinic, loadingClinics } = useClinic();
  const { getAccessToken } = useAuth();
  const [endDay, setEndDay] = useState(myanmarToday);
  const [startDay, setStartDay] = useState(() => `${myanmarToday().slice(0, 7)}-01`);
  const companyId = currentClinic?.companyId;
  const validRange = Boolean(startDay && endDay && startDay <= endDay);
  const load = useCallback(async (signal: AbortSignal) => {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('Your session has expired. Please sign in again.');
    const data = await postApicoreGraphql<{ biBranchPerformance: BranchPerformanceRow[] }>({
      query: QUERY, variables: { companyId, startDay, endDay }, accessToken, signal,
    });
    if (!Array.isArray(data.biBranchPerformance)) throw new Error('The report did not return branch totals.');
    return data.biBranchPerformance;
  }, [companyId, startDay, endDay, getAccessToken]);
  const report = useReportSection(companyId && validRange ? load : null);
  const rows = report.data ?? [];
  const totals = branchTotals(rows);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h4" component="h1" fontWeight={700}>Branch Performance</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
        {currentClinic?.companyName || currentClinic?.name} · All branches you can access · Myanmar time
      </Typography>
      <Stack direction="row" gap={2} flexWrap="wrap" sx={{ mb: 2 }}>
        <TextField type="date" size="small" label="From" value={startDay} InputLabelProps={{ shrink: true }}
          inputProps={{ max: endDay || undefined }} onChange={event => setStartDay(event.target.value)} />
        <TextField type="date" size="small" label="To" value={endDay} InputLabelProps={{ shrink: true }}
          inputProps={{ min: startDay || undefined }} onChange={event => setEndDay(event.target.value)} />
      </Stack>
      {!validRange && <Alert severity="info">Choose a start date on or before the end date.</Alert>}
      {!loadingClinics && !companyId && <Alert severity="info">Company information is unavailable for this clinic.</Alert>}
      {(loadingClinics || report.loading) && <LinearProgress aria-label="Loading branch performance" />}
      {report.error && <Alert severity="warning" action={<Button onClick={report.retry}>Retry</Button>}>{report.error}</Alert>}
      {report.data && (rows.length ? (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Branch performance">
              <TableHead><TableRow>
                {['Branch', 'Appointments', 'Completed services', 'Invoices', 'Gross sales', 'Payments received'].map((name, i) =>
                  <TableCell key={name} scope="col" align={i ? 'right' : 'left'}>{name}</TableCell>)}
              </TableRow></TableHead>
              <TableBody>{rows.map(row => <TableRow key={row.clinicId}>
                <TableCell component="th" scope="row">{row.clinicName}</TableCell>
                <MetricCells metrics={row} currency={row.currency} />
              </TableRow>)}</TableBody>
              <TableFooter sx={{ '& td, & th': { color: 'text.primary', fontWeight: 700 } }}>
                {totals.currencies.size > 1 && <TableRow>
                  <TableCell component="th" scope="row">All shown branches</TableCell>
                  <MetricCells metrics={totals.all} />
                </TableRow>}
                {[...totals.currencies].map(([currency, metrics]) => <TableRow key={currency}>
                  <TableCell component="th" scope="row">{totals.currencies.size > 1 ? `Total (${currency})` : 'Total for shown branches'}</TableCell>
                  <MetricCells metrics={metrics} currency={currency} />
                </TableRow>)}
              </TableFooter>
            </Table>
          </TableContainer>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Appointments include all scheduled statuses. Completed services count checked-out treatments by check-in date.
            Gross sales use the invoice date. Payments received use the receipt date.
          </Typography>
        </>
      ) : <Alert severity="info">No branches are available for this company.</Alert>)}
    </Box>
  );
}
