import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { format, startOfYear, subYears } from 'date-fns';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useClinic } from '../contexts/ClinicContext';
import { getServiceDetailsPath } from '../utils/serviceNavigation';
import {
  buildTreatmentDetailsQuery,
  buildTreatmentFilterOptionsQuery,
  type TreatmentPerformanceMetric,
} from '../utils/treatmentPerformance';

type ViewMode = 'yearly' | 'monthly';
type SortDirection = 'asc' | 'desc';

interface TreatmentPeriodMetrics {
  treatmentReturns: number;
  newPurchases: number;
  totalActivity: number;
}

interface TreatmentMatrixRow {
  serviceName: string;
  serviceCategory: string;
  monthly: Record<string, TreatmentPeriodMetrics>;
}

interface SortDescriptor {
  periodKey: string;
  metric: TreatmentPerformanceMetric;
  direction: SortDirection;
}

interface ReportPeriod {
  key: string;
  label: string;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHLY_TOTAL_PERIOD_KEY = '__monthly-total__';
const ZERO_METRICS: TreatmentPeriodMetrics = { treatmentReturns: 0, newPurchases: 0, totalActivity: 0 };

const parseNumber = (value: unknown) => {
  const rawValue = value && typeof value === 'object' && 'value' in value
    ? (value as { value: unknown }).value
    : value;
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

export const buildTreatmentMatrix = (rawRows: unknown[]): TreatmentMatrixRow[] => {
  const rowsByService = new Map<string, TreatmentMatrixRow>();

  rawRows.forEach(rawRow => {
    const row = rawRow as Record<string, unknown>;
    const serviceName = String(row.serviceName || '').trim();
    const serviceCategory = String(row.serviceCategory || 'Uncategorized').trim() || 'Uncategorized';
    const year = parseNumber(row.activityYear);
    const month = parseNumber(row.activityMonth);
    if (!serviceName || year < 2000 || month < 1 || month > 12) return;

    const rowKey = `${serviceName}\u0000${serviceCategory}`;
    const periodKey = `${year}-${String(month).padStart(2, '0')}`;
    const treatmentReturns = parseNumber(row.treatmentReturns);
    const newPurchases = parseNumber(row.newPurchases);
    const existing = rowsByService.get(rowKey) || {
      serviceName,
      serviceCategory,
      monthly: {},
    };
    const previous = existing.monthly[periodKey] || ZERO_METRICS;

    existing.monthly[periodKey] = {
      treatmentReturns: previous.treatmentReturns + treatmentReturns,
      newPurchases: previous.newPurchases + newPurchases,
      totalActivity: previous.totalActivity + treatmentReturns + newPurchases,
    };
    rowsByService.set(rowKey, existing);
  });

  return Array.from(rowsByService.values()).sort((left, right) => left.serviceName.localeCompare(right.serviceName));
};

export const getTreatmentPeriodMetrics = (
  row: TreatmentMatrixRow,
  periodKey: string,
  viewMode: ViewMode,
): TreatmentPeriodMetrics => {
  if (viewMode === 'monthly') {
    return row.monthly[periodKey] || ZERO_METRICS;
  }

  return Object.entries(row.monthly).reduce<TreatmentPeriodMetrics>((total, [monthKey, metrics]) => {
    if (!monthKey.startsWith(`${periodKey}-`)) return total;
    return {
      treatmentReturns: total.treatmentReturns + metrics.treatmentReturns,
      newPurchases: total.newPurchases + metrics.newPurchases,
      totalActivity: total.totalActivity + metrics.totalActivity,
    };
  }, { ...ZERO_METRICS });
};

export const getTreatmentYearTotal = (row: TreatmentMatrixRow, year: number) => (
  getTreatmentPeriodMetrics(row, String(year), 'yearly').totalActivity
);

const getHeatmapStyle = (value: number, maximum: number, metric: TreatmentPerformanceMetric) => {
  if (value <= 0) {
    return { bgcolor: 'var(--surface-secondary)', color: 'var(--text-muted)' };
  }

  const ratio = Math.min(1, value / Math.max(1, maximum));
  const opacity = 0.12 + Math.sqrt(ratio) * 0.78;
  const color = metric === 'treatmentReturns'
    ? `rgba(18, 130, 101, ${opacity})`
    : metric === 'newPurchases'
      ? `rgba(201, 126, 17, ${opacity})`
      : `rgba(7, 65, 66, ${opacity})`;

  return {
    bgcolor: color,
    color: ratio >= 0.48 ? '#ffffff' : 'var(--text-primary)',
  };
};

const metricLabels: Record<TreatmentPerformanceMetric, string> = {
  treatmentReturns: 'Returns',
  newPurchases: 'New',
  totalActivity: 'Total',
};

const metricDescriptions: Record<TreatmentPerformanceMetric, string> = {
  treatmentReturns: 'Distinct zero-value CO treatment/service orders.',
  newPurchases: 'Distinct positive-value service or package orders.',
  totalActivity: 'Treatment Returns + New Purchases.',
};

const TreatmentDetailsReport = () => {
  const { currentClinic, availableClinics, setCurrentClinic } = useClinic();
  const requestIdRef = useRef(0);
  const filterRequestIdRef = useRef(0);
  const now = new Date();
  const [viewMode, setViewMode] = useState<ViewMode>('yearly');
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [startDate, setStartDate] = useState<Date | null>(() => startOfYear(subYears(now, 4)));
  const [endDate, setEndDate] = useState<Date | null>(() => now);
  const [matrixRows, setMatrixRows] = useState<TreatmentMatrixRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [practitioners, setPractitioners] = useState<string[]>([]);
  const [serviceOptions, setServiceOptions] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [practitioner, setPractitioner] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState<SortDescriptor>({
    periodKey: String(now.getFullYear()),
    metric: 'totalActivity',
    direction: 'desc',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchFilterOptions = useCallback(async () => {
    if (!currentClinic) return;
    const requestId = ++filterRequestIdRef.current;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: buildTreatmentFilterOptionsQuery(currentClinic.id) }),
      });
      const result = await response.json();
      if (requestId !== filterRequestIdRef.current || !response.ok || !result.success) return;

      const optionRows = (result.data || []) as Array<{ optionType?: string; optionValue?: string }>;
      setCategories(optionRows
        .filter(row => row.optionType === 'category' && row.optionValue)
        .map(row => String(row.optionValue)));
      setPractitioners(optionRows
        .filter(row => row.optionType === 'practitioner' && row.optionValue)
        .map(row => String(row.optionValue)));
      setServiceOptions(optionRows
        .filter(row => row.optionType === 'service' && row.optionValue)
        .map(row => String(row.optionValue)));
    } catch {
      if (requestId === filterRequestIdRef.current) {
        setCategories([]);
        setPractitioners([]);
        setServiceOptions([]);
      }
    }
  }, [currentClinic]);

  const fetchTreatmentDetails = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!currentClinic) {
      setError('Select a clinic to load this report.');
      setLoading(false);
      return;
    }
    if (!startDate || !endDate || startDate > endDate) {
      setError('Choose a valid start and end date.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const query = buildTreatmentDetailsQuery({
      clinicCode: currentClinic.code,
      clinicId: currentClinic.id,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      category: category || undefined,
      practitioner: practitioner || undefined,
      services: selectedServices.length > 0 ? selectedServices : undefined,
    });

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const result = await response.json();

      if (requestId !== requestIdRef.current) return;
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Unable to load treatment details (${response.status}).`);
      }

      setMatrixRows(buildTreatmentMatrix(result.data || []));
      setLastUpdated(new Date());
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) return;
      setMatrixRows([]);
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load treatment details.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [category, currentClinic, endDate, practitioner, selectedServices, startDate]);

  useEffect(() => {
    setCategory('');
    setPractitioner('');
    setSelectedServices([]);
    fetchFilterOptions();
  }, [currentClinic?.id, fetchFilterOptions]);

  useEffect(() => {
    fetchTreatmentDetails();
  }, [fetchTreatmentDetails]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    matrixRows.forEach(row => {
      Object.keys(row.monthly).forEach(periodKey => years.add(Number(periodKey.slice(0, 4))));
    });
    return Array.from(years).filter(Number.isFinite).sort((left, right) => left - right);
  }, [matrixRows]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, selectedYear]);

  const periods = useMemo<ReportPeriod[]>(() => {
    if (viewMode === 'yearly') {
      return availableYears.map(year => ({ key: String(year), label: String(year) }));
    }

    return MONTH_LABELS.map((label, index) => ({
      key: `${selectedYear}-${String(index + 1).padStart(2, '0')}`,
      label,
    }));
  }, [availableYears, selectedYear, viewMode]);

  useEffect(() => {
    const isMonthlyTotalSort = viewMode === 'monthly' && sort.periodKey === MONTHLY_TOTAL_PERIOD_KEY;
    if (periods.length === 0 || isMonthlyTotalSort || periods.some(period => period.key === sort.periodKey)) return;
    setSort({
      periodKey: periods[periods.length - 1].key,
      metric: 'totalActivity',
      direction: 'desc',
    });
  }, [periods, sort.periodKey, viewMode]);

  const visibleRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    const filtered = search
      ? matrixRows.filter(row => row.serviceName.toLowerCase().includes(search))
      : matrixRows;

    return [...filtered].sort((left, right) => {
      const isMonthlyTotalSort = viewMode === 'monthly' && sort.periodKey === MONTHLY_TOTAL_PERIOD_KEY;
      const leftValue = isMonthlyTotalSort
        ? getTreatmentYearTotal(left, selectedYear)
        : getTreatmentPeriodMetrics(left, sort.periodKey, viewMode)[sort.metric];
      const rightValue = isMonthlyTotalSort
        ? getTreatmentYearTotal(right, selectedYear)
        : getTreatmentPeriodMetrics(right, sort.periodKey, viewMode)[sort.metric];
      const difference = leftValue - rightValue;
      if (difference !== 0) return sort.direction === 'asc' ? difference : -difference;
      return left.serviceName.localeCompare(right.serviceName);
    });
  }, [matrixRows, searchTerm, selectedYear, sort, viewMode]);

  const monthlyTotalMaximum = useMemo(() => (
    viewMode === 'monthly'
      ? visibleRows.reduce((maximum, row) => Math.max(maximum, getTreatmentYearTotal(row, selectedYear)), 0)
      : 0
  ), [selectedYear, viewMode, visibleRows]);

  const maxima = useMemo<Record<TreatmentPerformanceMetric, number>>(() => {
    const values: Record<TreatmentPerformanceMetric, number> = {
      treatmentReturns: 0,
      newPurchases: 0,
      totalActivity: 0,
    };

    visibleRows.forEach(row => {
      periods.forEach(period => {
        const metrics = getTreatmentPeriodMetrics(row, period.key, viewMode);
        values.treatmentReturns = Math.max(values.treatmentReturns, metrics.treatmentReturns);
        values.newPurchases = Math.max(values.newPurchases, metrics.newPurchases);
        values.totalActivity = Math.max(values.totalActivity, metrics.totalActivity);
      });
    });
    return values;
  }, [periods, viewMode, visibleRows]);

  const summary = useMemo(() => visibleRows.reduce((total, row) => {
    periods.forEach(period => {
      const metrics = getTreatmentPeriodMetrics(row, period.key, viewMode);
      total.treatmentReturns += metrics.treatmentReturns;
      total.newPurchases += metrics.newPurchases;
      total.totalActivity += metrics.totalActivity;
    });
    return total;
  }, { ...ZERO_METRICS }), [periods, viewMode, visibleRows]);

  const handleSort = (periodKey: string, metric: TreatmentPerformanceMetric) => {
    setSort(previous => ({
      periodKey,
      metric,
      direction: previous.periodKey === periodKey && previous.metric === metric && previous.direction === 'desc'
        ? 'asc'
        : 'desc',
    }));
  };

  const exportReport = () => {
    if (!currentClinic || !startDate || !endDate || visibleRows.length === 0) return;

    const flatHeaders = [
      'Service / Treatment',
      ...(viewMode === 'monthly' ? [`${selectedYear} Total Activity`] : []),
      'Service Category',
      ...periods.flatMap(period => [
        `${period.label} Treatment Returns`,
        `${period.label} New Purchases`,
        `${period.label} Total Activity`,
      ]),
    ];
    const dataRows = visibleRows.map(row => [
      row.serviceName,
      ...(viewMode === 'monthly' ? [getTreatmentYearTotal(row, selectedYear)] : []),
      row.serviceCategory,
      ...periods.flatMap(period => {
        const metrics = getTreatmentPeriodMetrics(row, period.key, viewMode);
        return [metrics.treatmentReturns, metrics.newPurchases, metrics.totalActivity];
      }),
    ]);
    const headerRow = 10;
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Treatment Details Report'],
      ['Clinic', currentClinic.name || currentClinic.code],
      ['Date Range', `${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`],
      ['View', viewMode === 'yearly' ? 'Yearly Overview' : `Monthly Detail · ${selectedYear}`],
      ['Service Category', category || 'All categories'],
      ['Doctor / Therapist', practitioner || 'All doctors / therapists'],
      ['Service / Treatment', selectedServices.length > 0 ? selectedServices.join(', ') : 'All services / treatments'],
      ['Search', searchTerm.trim() || 'All services'],
      ['Definition', 'Total Activity = distinct zero-value CO treatment returns + distinct positive-value service/package purchases. Booking deposit is excluded.'],
      flatHeaders,
      ...dataRows,
    ]);

    worksheet['!cols'] = [
      { wch: 42 },
      ...(viewMode === 'monthly' ? [{ wch: 20 }] : []),
      { wch: 24 },
      ...periods.flatMap(() => [{ wch: 20 }, { wch: 19 }, { wch: 17 }]),
    ];
    worksheet['!autofilter'] = {
      ref: `A${headerRow}:${XLSX.utils.encode_col(flatHeaders.length - 1)}${headerRow + dataRows.length}`,
    };
    (worksheet as XLSX.WorkSheet & { '!freeze'?: unknown })['!freeze'] = { xSplit: viewMode === 'monthly' ? 3 : 2, ySplit: headerRow };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, viewMode === 'yearly' ? 'Yearly Overview' : `${selectedYear} Monthly`);
    const safeClinic = currentClinic.code.replace(/[^a-z0-9_-]+/gi, '_');
    XLSX.writeFile(workbook, `treatment_details_${safeClinic}_${format(startDate, 'yyyyMMdd')}_${format(endDate, 'yyyyMMdd')}.xlsx`);
  };

  const totalColumns = Math.max(1, periods.length * 3 + 1 + (viewMode === 'monthly' ? 1 : 0));
  const tableMinWidth = Math.max(900, 300 + periods.length * 3 * 96 + (viewMode === 'monthly' ? 120 : 0));

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: { xs: 2, md: 3 }, minHeight: 'calc(100vh - 64px)', bgcolor: 'var(--background)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
          <Box>
            <Button
              component={Link}
              to="/top-treatment-report"
              size="small"
              startIcon={<ArrowBackIcon />}
              sx={{ mb: 0.75, color: 'var(--text-secondary)' }}
            >
              Top Treatment Report
            </Button>
            <Typography variant="h4" component="h1" sx={{ color: 'var(--text-primary)', fontWeight: 750, letterSpacing: '-0.035em' }}>
              Treatment Details Report
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: 0.6 }}>
              Compare treatment returns and new purchases across every service
              {lastUpdated ? ` · Updated ${format(lastUpdated, 'h:mm a')}` : ''}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={fetchTreatmentDetails}
              disabled={loading}
              sx={{ color: 'var(--primary)', borderColor: 'var(--border)', bgcolor: 'var(--surface)' }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<FileDownloadOutlinedIcon />}
              onClick={exportReport}
              disabled={loading || visibleRows.length === 0}
              sx={{ bgcolor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary-hover)' } }}
            >
              Export Excel
            </Button>
          </Box>
        </Box>

        <Paper sx={{ p: 2, mb: 2.5, bgcolor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 2.5, boxShadow: 'var(--shadow-sm)' }}>
          <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 190 }}>
              <InputLabel>Clinic</InputLabel>
              <Select
                label="Clinic"
                value={currentClinic?.id || ''}
                onChange={event => {
                  const clinic = availableClinics.find(item => item.id === event.target.value);
                  if (clinic) setCurrentClinic(clinic);
                }}
              >
                {availableClinics.map(clinic => <MenuItem key={clinic.id} value={clinic.id}>{clinic.name}</MenuItem>)}
              </Select>
            </FormControl>
            <DatePicker
              label="Start Date"
              value={startDate}
              onChange={date => {
                setStartDate(date);
                if (date && endDate && date > endDate) setEndDate(date);
              }}
              maxDate={endDate || undefined}
              slotProps={{ textField: { size: 'small', sx: { minWidth: 155 } } }}
            />
            <DatePicker
              label="End Date"
              value={endDate}
              onChange={date => {
                setEndDate(date);
                if (date && startDate && date < startDate) setStartDate(date);
              }}
              minDate={startDate || undefined}
              slotProps={{ textField: { size: 'small', sx: { minWidth: 155 } } }}
            />
            <Button size="small" variant="outlined" onClick={() => setStartDate(startOfYear(subYears(new Date(), 2)))}>3Y</Button>
            <Button size="small" variant="outlined" onClick={() => setStartDate(startOfYear(subYears(new Date(), 4)))}>5Y</Button>
            <Button size="small" variant="outlined" onClick={() => setStartDate(new Date(2000, 0, 1))}>All History</Button>
            <FormControl size="small" sx={{ minWidth: 185 }}>
              <InputLabel>Service Category</InputLabel>
              <Select label="Service Category" value={category} onChange={event => setCategory(event.target.value)}>
                <MenuItem value="">All categories</MenuItem>
                {categories.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 210 }}>
              <InputLabel>Doctor / Therapist</InputLabel>
              <Select label="Doctor / Therapist" value={practitioner} onChange={event => setPractitioner(event.target.value)}>
                <MenuItem value="">All doctors / therapists</MenuItem>
                {practitioners.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
              </Select>
            </FormControl>
            <Autocomplete
              multiple
              disableCloseOnSelect
              filterSelectedOptions
              limitTags={1}
              size="small"
              options={serviceOptions}
              value={selectedServices}
              onChange={(_event, nextServices) => setSelectedServices(nextServices)}
              renderInput={params => (
                <TextField
                  {...params}
                  label="Service / Treatment"
                  placeholder={selectedServices.length === 0 ? 'All services / treatments' : ''}
                />
              )}
              sx={{ minWidth: { xs: '100%', sm: 285 }, maxWidth: { sm: 390 } }}
            />
            <TextField
              size="small"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search service name..."
              inputProps={{ 'aria-label': 'Search service name' }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: 'var(--text-secondary)' }} /></InputAdornment>,
              }}
              sx={{ minWidth: { xs: '100%', sm: 225 } }}
            />
          </Box>
        </Paper>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={viewMode}
            onChange={(_event, nextView: ViewMode | null) => nextView && setViewMode(nextView)}
            sx={{ bgcolor: 'var(--surface)' }}
          >
            <ToggleButton value="yearly">Yearly Overview</ToggleButton>
            <ToggleButton value="monthly">Monthly Detail</ToggleButton>
          </ToggleButtonGroup>
          {viewMode === 'monthly' && (
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Year</InputLabel>
              <Select label="Year" value={selectedYear} onChange={event => setSelectedYear(Number(event.target.value))}>
                {availableYears.map(year => <MenuItem key={year} value={year}>{year}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          <Box sx={{ flex: 1 }} />
          <Chip label={`${visibleRows.length} services`} size="small" sx={{ bgcolor: 'var(--surface)', color: 'var(--text-secondary)' }} />
          <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>Grouped in Asia/Yangon clinic time</Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2.5 }} action={<Button color="inherit" size="small" onClick={fetchTreatmentDetails}>Retry</Button>}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {[
            { label: 'Services / Treatments', value: visibleRows.length, note: 'Visible services in the matrix', color: 'var(--primary)' },
            { label: 'Treatment Returns', value: summary.treatmentReturns, note: 'Distinct zero-value CO orders', color: 'var(--success)' },
            { label: 'New Purchases', value: summary.newPurchases, note: 'Distinct positive-value orders', color: 'var(--warning)' },
            { label: 'Total Activity', value: summary.totalActivity, note: 'Returns + new purchases', color: 'var(--primary)' },
          ].map(card => (
            <Grid item xs={12} sm={6} lg={3} key={card.label}>
              <Paper sx={{ p: 2, height: '100%', bgcolor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 2.5, boxShadow: 'var(--shadow-sm)' }}>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{card.label}</Typography>
                {loading ? <Skeleton width="55%" height={42} /> : (
                  <Typography sx={{ mt: 0.7, color: card.color, fontWeight: 750, fontSize: '1.7rem', fontVariantNumeric: 'tabular-nums' }}>
                    {card.value.toLocaleString('en-US')}
                  </Typography>
                )}
                <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>{card.note}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Paper sx={{ bgcolor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 2.5, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid var(--border)' }}>
            <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>
              {viewMode === 'yearly' ? 'Yearly treatment performance' : `Monthly treatment performance · ${selectedYear}`}
            </Typography>
            <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
              Darker cells indicate higher activity within each metric. Select any numeric heading to sort.
            </Typography>
          </Box>
          <TableContainer sx={{ maxHeight: 'calc(100vh - 285px)', overflow: 'auto' }}>
            <Table stickyHeader size="small" sx={{ minWidth: tableMinWidth }} aria-label="Treatment details performance matrix">
              <TableHead>
                <TableRow sx={{ height: 44 }}>
                  <TableCell
                    rowSpan={2}
                    sx={{
                      position: 'sticky', left: 0, top: 0, zIndex: 8,
                      minWidth: 300, maxWidth: 300,
                      bgcolor: 'var(--surface)', color: 'var(--text-primary)', fontWeight: 750,
                      borderRight: viewMode === 'monthly' ? '1px solid var(--border)' : '2px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    Service / Treatment
                  </TableCell>
                  {viewMode === 'monthly' && (
                    <TableCell
                      rowSpan={2}
                      align="center"
                      sx={{
                        position: 'sticky', left: 300, top: 0, zIndex: 8,
                        minWidth: 120, maxWidth: 120,
                        bgcolor: 'var(--surface)', color: 'var(--text-primary)', fontWeight: 750,
                        borderRight: '2px solid var(--border)', borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Tooltip title={`Total Activity across January–December ${selectedYear}`} arrow>
                        <TableSortLabel
                          active={sort.periodKey === MONTHLY_TOTAL_PERIOD_KEY}
                          direction={sort.periodKey === MONTHLY_TOTAL_PERIOD_KEY ? sort.direction : 'desc'}
                          onClick={() => handleSort(MONTHLY_TOTAL_PERIOD_KEY, 'totalActivity')}
                          sx={{
                            color: 'var(--text-primary) !important',
                            '&.Mui-active': { color: 'var(--primary) !important' },
                            '& .MuiTableSortLabel-icon': { color: 'var(--primary) !important' },
                          }}
                        >
                          Total
                        </TableSortLabel>
                      </Tooltip>
                    </TableCell>
                  )}
                  {periods.map(period => (
                    <TableCell
                      key={period.key}
                      colSpan={3}
                      align="center"
                      sx={{
                        position: 'sticky', top: 0, zIndex: 5,
                        height: 44, bgcolor: 'var(--surface)', color: 'var(--text-primary)', fontWeight: 750,
                        borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                      }}
                    >
                      {period.label}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow sx={{ height: 44 }}>
                  {periods.flatMap(period => (
                    (Object.keys(metricLabels) as TreatmentPerformanceMetric[]).map(metric => (
                      <TableCell
                        key={`${period.key}-${metric}`}
                        align="center"
                        sx={{
                          position: 'sticky', top: 44, zIndex: 6,
                          minWidth: 96, bgcolor: 'var(--surface-secondary)', color: 'var(--text-secondary)',
                          fontWeight: 700, borderLeft: metric === 'treatmentReturns' ? '1px solid var(--border)' : undefined,
                          borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                        }}
                      >
                        <Tooltip title={metricDescriptions[metric]} arrow>
                          <TableSortLabel
                            active={sort.periodKey === period.key && sort.metric === metric}
                            direction={sort.periodKey === period.key && sort.metric === metric ? sort.direction : 'desc'}
                            onClick={() => handleSort(period.key, metric)}
                            sx={{
                              color: 'var(--text-secondary) !important',
                              '&.Mui-active': { color: 'var(--primary) !important' },
                              '& .MuiTableSortLabel-icon': { color: 'var(--primary) !important' },
                            }}
                          >
                            {metricLabels[metric]}
                          </TableSortLabel>
                        </Tooltip>
                      </TableCell>
                    ))
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? Array.from({ length: 8 }, (_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={totalColumns} sx={{ py: 1 }}><Skeleton height={34} /></TableCell>
                  </TableRow>
                )) : visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={totalColumns} align="center" sx={{ py: 8, color: 'var(--text-secondary)' }}>
                      {searchTerm ? 'No services match this search.' : 'No treatment activity matches the selected filters and date range.'}
                    </TableCell>
                  </TableRow>
                ) : visibleRows.map((row, rowIndex) => {
                  const baseBackground = rowIndex % 2 === 0 ? 'var(--surface)' : 'var(--surface-secondary)';
                  const monthlyTotal = viewMode === 'monthly' ? getTreatmentYearTotal(row, selectedYear) : 0;
                  return (
                    <TableRow key={`${row.serviceName}-${row.serviceCategory}`} hover>
                      <TableCell
                        sx={{
                          position: 'sticky', left: 0, zIndex: 2,
                          minWidth: 300, maxWidth: 300,
                          bgcolor: baseBackground, color: 'var(--text-primary)', fontWeight: 650,
                          borderRight: viewMode === 'monthly' ? '1px solid var(--border)' : '2px solid var(--border)',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <Typography
                          component={Link}
                          to={getServiceDetailsPath(row.serviceName)}
                          noWrap
                          title={`Open ${row.serviceName} details`}
                          sx={{
                            display: 'block',
                            color: 'var(--primary)',
                            fontWeight: 'inherit',
                            fontSize: '0.875rem',
                            textDecoration: 'none',
                            '&:hover': { textDecoration: 'underline' },
                            '&:focus-visible': { outline: '2px solid var(--primary)', outlineOffset: 2, borderRadius: 0.5 },
                          }}
                        >
                          {row.serviceName}
                        </Typography>
                        <Typography noWrap title={row.serviceCategory} sx={{ color: 'var(--text-muted)', fontSize: '0.7rem', mt: 0.25 }}>
                          {row.serviceCategory}
                        </Typography>
                      </TableCell>
                      {viewMode === 'monthly' && (
                        <Tooltip title={`${row.serviceName} · ${selectedYear} · Total Activity ${monthlyTotal.toLocaleString('en-US')}`} arrow>
                          <TableCell
                            align="center"
                            sx={{
                              position: 'sticky', left: 300, zIndex: 2,
                              ...getHeatmapStyle(monthlyTotal, monthlyTotalMaximum, 'totalActivity'),
                              minWidth: 120, maxWidth: 120, px: 1.25, py: 1.35,
                              fontWeight: monthlyTotal > 0 ? 750 : 400,
                              fontVariantNumeric: 'tabular-nums',
                              borderRight: '2px solid var(--border)', borderBottom: '1px solid var(--border)',
                              transition: 'filter 120ms ease',
                              '&:hover': { filter: 'brightness(1.08)' },
                            }}
                          >
                            {monthlyTotal > 0 ? monthlyTotal.toLocaleString('en-US') : '–'}
                          </TableCell>
                        </Tooltip>
                      )}
                      {periods.flatMap(period => {
                        const metrics = getTreatmentPeriodMetrics(row, period.key, viewMode);
                        return (Object.keys(metricLabels) as TreatmentPerformanceMetric[]).map(metric => {
                          const value = metrics[metric];
                          return (
                            <Tooltip
                              key={`${row.serviceName}-${period.key}-${metric}`}
                              title={`${row.serviceName} · ${period.label} · ${metricDescriptions[metric]} ${value.toLocaleString('en-US')}`}
                              arrow
                            >
                              <TableCell
                                align="center"
                                sx={{
                                  ...getHeatmapStyle(value, maxima[metric], metric),
                                  minWidth: 96, px: 1.25, py: 1.35,
                                  fontWeight: value > 0 ? 750 : 400,
                                  fontVariantNumeric: 'tabular-nums',
                                  borderLeft: metric === 'treatmentReturns' ? '1px solid var(--border)' : undefined,
                                  borderBottom: '1px solid var(--border)',
                                  transition: 'filter 120ms ease',
                                  '&:hover': { filter: 'brightness(1.08)' },
                                }}
                              >
                                {value > 0 ? value.toLocaleString('en-US') : '–'}
                              </TableCell>
                            </Tooltip>
                          );
                        });
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1.5 }}>
          {[
            { label: 'Treatment Returns', color: 'rgba(18, 130, 101, 0.65)' },
            { label: 'New Purchases', color: 'rgba(201, 126, 17, 0.65)' },
            { label: 'Total Activity', color: 'rgba(7, 65, 66, 0.75)' },
          ].map(item => (
            <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <Box sx={{ width: 18, height: 18, borderRadius: 0.75, bgcolor: item.color, border: '1px solid var(--border)' }} />
              <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>{item.label}</Typography>
            </Box>
          ))}
          <Typography variant="caption" sx={{ color: 'var(--text-muted)', ml: { md: 'auto' } }}>
            Counts are distinct orders per service. Booking deposit is excluded.
          </Typography>
        </Box>
      </Box>
    </LocalizationProvider>
  );
};

export default TreatmentDetailsReport;
