import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
  SelectChangeEvent,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { format, parseISO } from 'date-fns';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useClinic } from '../contexts/ClinicContext';

type BalanceFilter = 'all' | 'remaining' | 'none';
type InactivitySegment = 'all' | 'recently-lapsed' | 'at-risk' | 'win-back' | 'long-term' | 'custom';
type SortOption = 'package-risk' | 'days-inactive-desc' | 'days-inactive-asc' | 'last-visited-desc' | 'last-visited-asc' | 'most-visits';

interface InactivityRange {
  minDays: number;
  maxDays: number | null;
  label: string;
  description: string;
  fileLabel: string;
}

interface InactiveCustomerRow {
  customerName: string;
  phoneNumber: string;
  memberId: string;
  lastVisited: string;
  daysInactive: number;
  lastService: string;
  lastTherapist: string;
  lifetimeVisits: number;
  packageUnitsRemaining: number;
  servicesWithBalance: number;
  remainingPackages: string;
}

interface PriorityDefinition {
  label: string;
  action: string;
  color: 'error' | 'warning' | 'success' | 'default';
}

const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''");

const INACTIVITY_SEGMENTS: Record<Exclude<InactivitySegment, 'custom'>, InactivityRange> = {
  all: {
    minDays: 30,
    maxDays: null,
    label: 'All inactive (30+ days)',
    description: '30+ days since last visit',
    fileLabel: '30plus_days'
  },
  'recently-lapsed': {
    minDays: 30,
    maxDays: 59,
    label: 'Recently lapsed (30–59 days)',
    description: '30–59 days since last visit',
    fileLabel: '30-59_days'
  },
  'at-risk': {
    minDays: 60,
    maxDays: 89,
    label: 'At risk (60–89 days)',
    description: '60–89 days since last visit',
    fileLabel: '60-89_days'
  },
  'win-back': {
    minDays: 90,
    maxDays: 179,
    label: 'Win-back (90–179 days)',
    description: '90–179 days since last visit',
    fileLabel: '90-179_days'
  },
  'long-term': {
    minDays: 180,
    maxDays: null,
    label: 'Long-term inactive (180+ days)',
    description: '180+ days since last visit',
    fileLabel: '180plus_days'
  }
};

const getPriority = (row: InactiveCustomerRow): PriorityDefinition => {
  if (row.packageUnitsRemaining > 0 && row.daysInactive >= 90) {
    return { label: 'Urgent', action: 'Package balance at risk', color: 'error' };
  }
  if (row.packageUnitsRemaining > 0) {
    return { label: 'High', action: 'Remind about remaining visits', color: 'warning' };
  }
  if (row.daysInactive >= 180) {
    return { label: 'Win-back', action: 'Consider a reactivation offer', color: 'default' };
  }
  if (row.daysInactive >= 90) {
    return { label: 'Win-back', action: 'Invite the customer back with a relevant offer', color: 'default' };
  }
  if (row.daysInactive >= 60) {
    return { label: 'At risk', action: 'Contact the customer before they lapse further', color: 'warning' };
  }
  return { label: 'Reminder', action: 'Send a visit reminder', color: 'success' };
};

const InactiveCustomersReport: React.FC = () => {
  const { currentClinic } = useClinic();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestIdRef = useRef(0);
  const [rows, setRows] = useState<InactiveCustomerRow[]>([]);
  const [inactivitySegment, setInactivitySegment] = useState<InactivitySegment>(() => {
    const value = searchParams.get('stage');
    return ['all', 'recently-lapsed', 'at-risk', 'win-back', 'long-term', 'custom'].includes(value || '')
      ? value as InactivitySegment
      : 'all';
  });
  const [customMinDays, setCustomMinDays] = useState(() => Math.max(1, Number(searchParams.get('from')) || 30));
  const [customMaxDays, setCustomMaxDays] = useState(() => Math.max(1, Number(searchParams.get('to')) || 89));
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>(() => {
    const value = searchParams.get('balance');
    return ['all', 'remaining', 'none'].includes(value || '') ? value as BalanceFilter : 'all';
  });
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const value = searchParams.get('sort');
    return ['package-risk', 'days-inactive-desc', 'days-inactive-asc', 'last-visited-desc', 'last-visited-asc', 'most-visits'].includes(value || '')
      ? value as SortOption
      : 'package-risk';
  });
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [page, setPage] = useState(() => Math.max(0, (Number(searchParams.get('page')) || 1) - 1));
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const value = Number(searchParams.get('rows'));
    return [25, 50, 100].includes(value) ? value : 25;
  });

  const inactivityRange = useMemo<InactivityRange>(() => {
    if (inactivitySegment !== 'custom') return INACTIVITY_SEGMENTS[inactivitySegment];

    const minDays = Math.max(1, Math.floor(Number(customMinDays) || 1));
    const maxDays = Math.max(minDays, Math.floor(Number(customMaxDays) || minDays));
    return {
      minDays,
      maxDays,
      label: `Custom range (${minDays}–${maxDays} days)`,
      description: `${minDays}–${maxDays} days since last visit`,
      fileLabel: `${minDays}-${maxDays}_days`
    };
  }, [customMaxDays, customMinDays, inactivitySegment]);

  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (inactivitySegment !== 'all') nextParams.set('stage', inactivitySegment);
    if (inactivitySegment === 'custom') {
      nextParams.set('from', String(customMinDays));
      nextParams.set('to', String(customMaxDays));
    }
    if (balanceFilter !== 'all') nextParams.set('balance', balanceFilter);
    if (sortBy !== 'package-risk') nextParams.set('sort', sortBy);
    if (searchTerm.trim()) nextParams.set('q', searchTerm.trim());
    if (page > 0) nextParams.set('page', String(page + 1));
    if (rowsPerPage !== 25) nextParams.set('rows', String(rowsPerPage));

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [balanceFilter, customMaxDays, customMinDays, inactivitySegment, page, rowsPerPage, searchParams, searchTerm, setSearchParams, sortBy]);

  const fetchInactiveCustomers = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!currentClinic) {
      setError('No clinic selected.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const clinicCode = escapeSqlLiteral(currentClinic.code);

    const query = `
      WITH BaseVisits AS (
        SELECT
          COALESCE(
            NULLIF(REGEXP_REPLACE(CustomerPhoneNumber, r'[^0-9]', ''), ''),
            CONCAT('customer:', COALESCE(NULLIF(CustomerID, ''), NULLIF(CustomerName, ''), 'unknown'))
          ) AS customer_key,
          CustomerName,
          CustomerPhoneNumber,
          CustomerID,
          BookingID,
          ServiceName,
          PractitionerName,
          CheckInTime,
          CheckOutTime
        FROM \`great_time.MainDataView\`
        WHERE LOWER(ClinicCode) = LOWER('${clinicCode}')
          AND CustomerName IS NOT NULL
          AND CheckOutTime IS NOT NULL
          AND DATE(CheckOutTime, 'Asia/Yangon') <= CURRENT_DATE('Asia/Yangon')
      ),
      CustomerVisits AS (
        SELECT
          customer_key,
          ARRAY_AGG(STRUCT(
            CustomerName AS customer_name,
            CustomerPhoneNumber AS phone_number,
            CustomerID AS member_id,
            CheckOutTime AS last_visited,
            ServiceName AS last_service,
            PractitionerName AS last_therapist
          ) ORDER BY CheckOutTime DESC, CheckInTime DESC LIMIT 1)[OFFSET(0)] AS latest,
          COUNT(DISTINCT BookingID) AS lifetime_visits
        FROM BaseVisits
        GROUP BY customer_key
      ),
      PackageStates AS (
        SELECT
          COALESCE(
            NULLIF(REGEXP_REPLACE(CustomerPhoneNumber, r'[^0-9]', ''), ''),
            CONCAT('customer:', COALESCE(NULLIF(CustomerID, ''), NULLIF(CustomerName, ''), 'unknown'))
          ) AS customer_key,
          TRIM(ServiceName) AS service_name,
          GREATEST(IFNULL(RemainingPackageCount, 0), 0) AS remaining_count
        FROM \`great_time.MainDataView\`
        WHERE LOWER(ClinicCode) = LOWER('${clinicCode}')
          AND CustomerName IS NOT NULL
          AND ServiceName IS NOT NULL
          AND RemainingPackageCount IS NOT NULL
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY customer_key, service_name
          ORDER BY CheckInTime DESC, CheckOutTime DESC
        ) = 1
      ),
      PackageSummary AS (
        SELECT
          customer_key,
          SUM(remaining_count) AS package_units_remaining,
          COUNTIF(remaining_count > 0) AS services_with_balance,
          STRING_AGG(
            IF(remaining_count > 0, CONCAT(service_name, ' (', CAST(remaining_count AS STRING), ')'), NULL),
            ', ' ORDER BY service_name
          ) AS remaining_packages
        FROM PackageStates
        GROUP BY customer_key
      )
      SELECT
        v.latest.customer_name AS customerName,
        v.latest.phone_number AS phoneNumber,
        v.latest.member_id AS memberId,
        FORMAT_TIMESTAMP('%Y-%m-%d', v.latest.last_visited, 'Asia/Yangon') AS lastVisited,
        DATE_DIFF(CURRENT_DATE('Asia/Yangon'), DATE(v.latest.last_visited, 'Asia/Yangon'), DAY) AS daysInactive,
        COALESCE(v.latest.last_service, 'Unknown') AS lastService,
        COALESCE(v.latest.last_therapist, 'Unassigned') AS lastTherapist,
        v.lifetime_visits AS lifetimeVisits,
        IFNULL(p.package_units_remaining, 0) AS packageUnitsRemaining,
        IFNULL(p.services_with_balance, 0) AS servicesWithBalance,
        IFNULL(p.remaining_packages, '') AS remainingPackages
      FROM CustomerVisits v
      LEFT JOIN PackageSummary p USING (customer_key)
      WHERE DATE_DIFF(CURRENT_DATE('Asia/Yangon'), DATE(v.latest.last_visited, 'Asia/Yangon'), DAY) >= ${inactivityRange.minDays}
        ${inactivityRange.maxDays === null
          ? ''
          : `AND DATE_DIFF(CURRENT_DATE('Asia/Yangon'), DATE(v.latest.last_visited, 'Asia/Yangon'), DAY) <= ${inactivityRange.maxDays}`}
      ORDER BY packageUnitsRemaining DESC, daysInactive DESC, customerName
    `;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const result = await response.json();

      if (requestId !== requestIdRef.current) return;
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Unable to load inactive customers (${response.status}).`);
      }

      setRows((result.data || []).map((row: any) => ({
        customerName: String(row.customerName || 'Unknown customer'),
        phoneNumber: String(row.phoneNumber || ''),
        memberId: String(row.memberId || ''),
        lastVisited: String(row.lastVisited || ''),
        daysInactive: Number(row.daysInactive) || 0,
        lastService: String(row.lastService || 'Unknown'),
        lastTherapist: String(row.lastTherapist || 'Unassigned'),
        lifetimeVisits: Number(row.lifetimeVisits) || 0,
        packageUnitsRemaining: Number(row.packageUnitsRemaining) || 0,
        servicesWithBalance: Number(row.servicesWithBalance) || 0,
        remainingPackages: String(row.remainingPackages || '')
      })));
      setLastUpdated(new Date());
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) return;
      setRows([]);
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load inactive customers.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [currentClinic, inactivityRange.maxDays, inactivityRange.minDays]);

  useEffect(() => {
    fetchInactiveCustomers();
  }, [fetchInactiveCustomers]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filtered = rows.filter(row => {
      const matchesBalance = balanceFilter === 'all'
        || (balanceFilter === 'remaining' && row.packageUnitsRemaining > 0)
        || (balanceFilter === 'none' && row.packageUnitsRemaining === 0);
      const matchesSearch = !normalizedSearch || [
        row.customerName,
        row.phoneNumber,
        row.memberId,
        row.lastService,
        row.lastTherapist,
        row.remainingPackages
      ].some(value => value.toLowerCase().includes(normalizedSearch));
      return matchesBalance && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'days-inactive-desc') return b.daysInactive - a.daysInactive;
      if (sortBy === 'days-inactive-asc') return a.daysInactive - b.daysInactive;
      if (sortBy === 'last-visited-desc') return b.lastVisited.localeCompare(a.lastVisited);
      if (sortBy === 'last-visited-asc') return a.lastVisited.localeCompare(b.lastVisited);
      if (sortBy === 'most-visits') return b.lifetimeVisits - a.lifetimeVisits;
      return b.packageUnitsRemaining - a.packageUnitsRemaining
        || b.daysInactive - a.daysInactive;
    });
  }, [balanceFilter, rows, searchTerm, sortBy]);

  const summary = useMemo(() => {
    const packageHolders = filteredRows.filter(row => row.packageUnitsRemaining > 0).length;
    const remainingUnits = filteredRows.reduce((total, row) => total + row.packageUnitsRemaining, 0);
    const averageDays = filteredRows.length
      ? Math.round(filteredRows.reduce((total, row) => total + row.daysInactive, 0) / filteredRows.length)
      : 0;
    return { packageHolders, remainingUnits, averageDays };
  }, [filteredRows]);

  const paginatedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  useEffect(() => {
    if (loading) return;
    const lastAvailablePage = Math.max(0, Math.ceil(filteredRows.length / rowsPerPage) - 1);
    if (page > lastAvailablePage) setPage(lastAvailablePage);
  }, [filteredRows.length, loading, page, rowsPerPage]);

  const handleInactivitySegmentChange = (event: SelectChangeEvent<InactivitySegment>) => {
    setInactivitySegment(event.target.value as InactivitySegment);
    setPage(0);
  };

  const handleColumnSort = (column: 'last-visited' | 'days-inactive') => {
    if (column === 'last-visited') {
      setSortBy(current => current === 'last-visited-desc' ? 'last-visited-asc' : 'last-visited-desc');
    } else {
      setSortBy(current => current === 'days-inactive-desc' ? 'days-inactive-asc' : 'days-inactive-desc');
    }
    setPage(0);
  };

  const handleExport = () => {
    if (filteredRows.length === 0) return;
    const headerRow = 9;
    const exportRows = filteredRows.map((row, index) => {
      const priority = getPriority(row);
      return [
        index + 1,
        row.customerName,
        row.phoneNumber,
        row.memberId,
        row.lastVisited,
        row.daysInactive,
        row.lastService,
        row.lastTherapist,
        row.lifetimeVisits,
        row.packageUnitsRemaining,
        row.servicesWithBalance,
        row.remainingPackages,
        priority.label,
        priority.action
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Inactive Customers Report'],
      ['Clinic', currentClinic?.name || currentClinic?.code || 'Clinic'],
      ['Inactivity Segment', inactivityRange.label],
      ['Definition', `Customers whose most recent completed visit was ${inactivityRange.description.toLowerCase()}`],
      ['Package Filter', balanceFilter === 'remaining' ? 'Has remaining package' : balanceFilter === 'none' ? 'No remaining package' : 'All customers'],
      ['Search Filter', searchTerm.trim() || 'All customers'],
      ['Generated', format(new Date(), 'yyyy-MM-dd h:mm a')],
      [],
      ['Rank', 'Customer Name', 'Phone Number', 'Member ID', 'Last Visited', 'Days Inactive', 'Last Service', 'Last Therapist', 'Lifetime Visits', 'Package Units Remaining', 'Services With Balance', 'Remaining Package Details', 'Follow-up Priority', 'Recommended Action'],
      ...exportRows
    ]);

    worksheet['!cols'] = [
      { wch: 8 }, { wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
      { wch: 30 }, { wch: 28 }, { wch: 15 }, { wch: 23 }, { wch: 22 }, { wch: 65 },
      { wch: 20 }, { wch: 32 }
    ];
    worksheet['!autofilter'] = { ref: `A${headerRow}:N${headerRow + exportRows.length}` };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inactive Customers');
    const safeClinicCode = (currentClinic?.code || 'clinic').replace(/[^a-z0-9_-]+/gi, '_');
    XLSX.writeFile(workbook, `inactive_customers_${safeClinicCode}_${inactivityRange.fileLabel}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const numberFormat = (value: number) => value.toLocaleString('en-US');
  const inactiveCustomersReturnUrl = `${location.pathname}${location.search}`;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, minHeight: 'calc(100vh - 64px)', bgcolor: 'var(--background)' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ color: 'var(--text-primary)', fontWeight: 750, letterSpacing: '-0.035em' }}>
            Inactive Customers
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: 0.6 }}>
            Find customers who have not returned and prioritize package balances at risk
            {lastUpdated ? ` · Updated ${format(lastUpdated, 'h:mm a')}` : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={fetchInactiveCustomers}
            disabled={loading}
            sx={{ color: 'var(--primary)', borderColor: 'var(--border)', bgcolor: 'var(--surface)' }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadOutlinedIcon />}
            onClick={handleExport}
            disabled={loading || filteredRows.length === 0}
            sx={{ bgcolor: 'var(--primary)', color: 'var(--text-on-primary)', '&:hover': { bgcolor: 'var(--primary-hover)' } }}
          >
            Export Excel
          </Button>
        </Box>
      </Box>

      <Paper sx={{ p: 2, mb: 2.5, bgcolor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 2.5, boxShadow: 'var(--shadow-sm)' }}>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(180px, 1fr))',
            lg: inactivitySegment === 'custom'
              ? '250px 130px 130px 210px 220px minmax(260px, 1fr)'
              : '250px 230px 220px minmax(260px, 1fr)'
          },
          gap: 1.5
        }}>
          <FormControl size="small">
            <InputLabel id="inactivity-segment-label">Inactivity stage</InputLabel>
            <Select<InactivitySegment>
              labelId="inactivity-segment-label"
              value={inactivitySegment}
              label="Inactivity stage"
              onChange={handleInactivitySegmentChange}
            >
              <MenuItem value="all">All inactive (30+ days)</MenuItem>
              <MenuItem value="recently-lapsed">Recently lapsed (30–59 days)</MenuItem>
              <MenuItem value="at-risk">At risk (60–89 days)</MenuItem>
              <MenuItem value="win-back">Win-back (90–179 days)</MenuItem>
              <MenuItem value="long-term">Long-term inactive (180+ days)</MenuItem>
              <MenuItem value="custom">Custom range</MenuItem>
            </Select>
          </FormControl>
          {inactivitySegment === 'custom' && (
            <TextField
              size="small"
              type="number"
              label="From days"
              value={customMinDays}
              onChange={event => {
                setCustomMinDays(Math.max(1, Number(event.target.value) || 1));
                setPage(0);
              }}
              inputProps={{ min: 1, step: 1, 'aria-label': 'Minimum inactive days' }}
            />
          )}
          {inactivitySegment === 'custom' && (
            <TextField
              size="small"
              type="number"
              label="To days"
              value={customMaxDays}
              error={customMaxDays < customMinDays}
              helperText={customMaxDays < customMinDays ? 'Must be at least From days' : undefined}
              onChange={event => {
                setCustomMaxDays(Math.max(1, Number(event.target.value) || 1));
                setPage(0);
              }}
              onBlur={() => setCustomMaxDays(current => Math.max(customMinDays, current))}
              inputProps={{ min: customMinDays, step: 1, 'aria-label': 'Maximum inactive days' }}
            />
          )}
          <FormControl size="small">
            <InputLabel id="package-balance-label">Package balance</InputLabel>
            <Select
              labelId="package-balance-label"
              value={balanceFilter}
              label="Package balance"
              onChange={event => {
                setBalanceFilter(event.target.value as BalanceFilter);
                setPage(0);
              }}
            >
              <MenuItem value="all">All customers</MenuItem>
              <MenuItem value="remaining">Has remaining package</MenuItem>
              <MenuItem value="none">No remaining package</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="inactive-sort-label">Sort by</InputLabel>
            <Select
              labelId="inactive-sort-label"
              value={sortBy}
              label="Sort by"
              onChange={event => {
                setSortBy(event.target.value as SortOption);
                setPage(0);
              }}
            >
              <MenuItem value="package-risk">Largest package balance</MenuItem>
              <MenuItem value="days-inactive-desc">Days inactive: highest first</MenuItem>
              <MenuItem value="days-inactive-asc">Days inactive: lowest first</MenuItem>
              <MenuItem value="last-visited-desc">Last visited: newest first</MenuItem>
              <MenuItem value="last-visited-asc">Last visited: oldest first</MenuItem>
              <MenuItem value="most-visits">Most lifetime visits</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            value={searchTerm}
            onChange={event => {
              setSearchTerm(event.target.value);
              setPage(0);
            }}
            placeholder="Search customer, phone, service or therapist..."
            inputProps={{ 'aria-label': 'Search inactive customers' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'var(--text-secondary)' }} />
                </InputAdornment>
              )
            }}
          />
        </Box>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {[
          { label: 'Inactive Customers', value: numberFormat(filteredRows.length), note: inactivityRange.description, icon: <PersonOffOutlinedIcon />, color: 'var(--primary)' },
          { label: 'Package Holders at Risk', value: numberFormat(summary.packageHolders), note: 'Inactive customers with a balance', icon: <Inventory2OutlinedIcon />, color: 'var(--error)' },
          { label: 'Remaining Package Visits', value: numberFormat(summary.remainingUnits), note: 'Unused treatment units', icon: <Inventory2OutlinedIcon />, color: 'var(--warning)' },
          { label: 'Average Days Inactive', value: numberFormat(summary.averageDays), note: 'Across the filtered customer list', icon: <EventBusyOutlinedIcon />, color: 'var(--text-primary)' }
        ].map(card => (
          <Grid item xs={12} sm={6} lg={3} key={card.label}>
            <Paper sx={{ p: 2.25, height: '100%', bgcolor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 2.5, boxShadow: 'var(--shadow-sm)' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{card.label}</Typography>
                  {loading ? <Skeleton width={90} height={44} /> : (
                    <Typography sx={{ mt: 0.8, color: card.color, fontWeight: 750, fontSize: '1.8rem', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
                      {card.value}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ color: card.color, opacity: 0.8 }}>{card.icon}</Box>
              </Box>
              <Typography variant="caption" sx={{ display: 'block', color: 'var(--text-muted)', mt: 0.8 }}>{card.note}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ bgcolor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 2.5, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 2, display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>Customer follow-up list</Typography>
            <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
              Click a customer name to open their complete profile and service history.
            </Typography>
          </Box>
          <Chip label={`${numberFormat(filteredRows.length)} customers`} size="small" sx={{ bgcolor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }} />
        </Box>

        <TableContainer sx={{ maxHeight: 'calc(100vh - 360px)', minHeight: 360 }}>
          <Table stickyHeader size="small" aria-label="Inactive customers report" sx={{ minWidth: 1280 }}>
            <TableHead>
              <TableRow>
                <TableCell>Customer</TableCell>
                <TableCell sortDirection={sortBy.startsWith('last-visited') ? (sortBy.endsWith('desc') ? 'desc' : 'asc') : false}>
                  <TableSortLabel
                    active={sortBy.startsWith('last-visited')}
                    direction={sortBy === 'last-visited-asc' ? 'asc' : 'desc'}
                    onClick={() => handleColumnSort('last-visited')}
                  >
                    Last Visited
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sortDirection={sortBy.startsWith('days-inactive') ? (sortBy.endsWith('desc') ? 'desc' : 'asc') : false}>
                  <TableSortLabel
                    active={sortBy.startsWith('days-inactive')}
                    direction={sortBy === 'days-inactive-asc' ? 'asc' : 'desc'}
                    onClick={() => handleColumnSort('days-inactive')}
                  >
                    Days Inactive
                  </TableSortLabel>
                </TableCell>
                <TableCell>Last Service</TableCell>
                <TableCell>Last Therapist</TableCell>
                <TableCell align="right">Lifetime Visits</TableCell>
                <TableCell align="right">
                  <Tooltip title="Latest remaining treatment units summed across this customer's services.">
                    <Box component="span" sx={{ cursor: 'help' }}>Package Balance</Box>
                  </Tooltip>
                </TableCell>
                <TableCell>Follow-up Priority</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? Array.from({ length: 10 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={8}><Skeleton height={36} /></TableCell>
                </TableRow>
              )) : paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 8, color: 'var(--text-secondary)' }}>
                    No inactive customers match the selected filters.
                  </TableCell>
                </TableRow>
              ) : paginatedRows.map(row => {
                const priority = getPriority(row);
                const customerIdentifier = row.phoneNumber || row.customerName;
                return (
                  <TableRow key={`${row.phoneNumber}-${row.customerName}`} hover>
                    <TableCell>
                      <Typography
                        component={Link}
                        to={`/customers/${encodeURIComponent(customerIdentifier)}`}
                        state={{ returnTo: inactiveCustomersReturnUrl, returnLabel: 'Inactive Customers' }}
                        sx={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                      >
                        {row.customerName}
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block', color: 'var(--text-muted)' }}>
                        {[row.phoneNumber, row.memberId && `ID ${row.memberId}`].filter(Boolean).join(' · ') || 'No contact details'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {row.lastVisited ? format(parseISO(row.lastVisited), 'dd MMM yyyy') : 'Unknown'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{numberFormat(row.daysInactive)}</TableCell>
                    <TableCell>{row.lastService}</TableCell>
                    <TableCell>{row.lastTherapist}</TableCell>
                    <TableCell align="right">{numberFormat(row.lifetimeVisits)}</TableCell>
                    <TableCell align="right">
                      {row.packageUnitsRemaining > 0 ? (
                        <Tooltip title={row.remainingPackages || 'Package balance available'} placement="left" arrow>
                          <Chip
                            label={`${row.servicesWithBalance} service${row.servicesWithBalance === 1 ? '' : 's'}`}
                            size="small"
                            sx={{ bgcolor: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning)', fontWeight: 700 }}
                          />
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" sx={{ color: 'var(--text-muted)' }}>None</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Tooltip title={priority.action} arrow>
                        <Chip label={priority.label} size="small" color={priority.color} variant={priority.color === 'default' ? 'outlined' : 'filled'} />
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={filteredRows.length}
          page={page}
          onPageChange={(_event, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={event => {
            setRowsPerPage(Number(event.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </Paper>

      <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'var(--text-muted)' }}>
        Definition: this view includes customers with {inactivityRange.description.toLowerCase()}. Inactivity is measured from the latest completed checkout through today in Myanmar time. Package balance uses the latest recorded remaining count for each customer and service. Future-dated visits are excluded.
      </Typography>
    </Box>
  );
};

export default InactiveCustomersReport;
