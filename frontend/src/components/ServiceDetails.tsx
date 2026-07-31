import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Box, Paper, Typography, Avatar, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, IconButton, Select, MenuItem, Pagination, useTheme, Button } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { ChartData } from 'chart.js';
import axios from 'axios';
import { SelectChangeEvent } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useClinic } from '../contexts/ClinicContext';
import { formatCurrency } from '../utils/currency';
import * as XLSX from 'xlsx';

interface ServiceDetailsProps {}

interface MonthlySale {
  month: string;
  count: number;
}

interface MonthlyLifecycle {
  month: string;
  treatmentReturns: number;
  newPurchases: number;
  totalActivity: number;
  returnShare: number;
}

interface ServiceRecord {
  checkin_time: string;
  customer_name: string;
  therapist_name: string;
  month: string;
  check_in_date?: string;
}

interface ServiceData {
  monthlySales: MonthlySale[];
  serviceRecords: ServiceRecord[];
  description: string;
  name?: string;
  image?: string;
  total_bookings?: number;
  total_customers?: number;
  total_revenue?: number;
  last_booking_date?: string;
  customers?: any[];
  boughtTogether?: any[];
  therapists?: any[];
  monthlyLifecycle?: MonthlyLifecycle[];
}

const fillCalendarYear = (data: MonthlySale[] = [], year: number): MonthlySale[] => {
  const counts = new Map(data.map((item) => [item.month, Number(item.count) || 0]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    return { month, count: counts.get(month) || 0 };
  });
};

const fillLifecycleYear = (data: MonthlyLifecycle[] = [], year: number): MonthlyLifecycle[] => {
  const values = new Map(data.map((item) => [item.month, {
    treatmentReturns: Number(item.treatmentReturns) || 0,
    newPurchases: Number(item.newPurchases) || 0,
    totalActivity: Number(item.totalActivity) || 0,
    returnShare: Number(item.returnShare) || 0,
  }]));

  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const value = values.get(month);
    return {
      month,
      treatmentReturns: value?.treatmentReturns || 0,
      newPurchases: value?.newPurchases || 0,
      totalActivity: value?.totalActivity || 0,
      returnShare: value?.returnShare || 0,
    };
  });
};

export const buildMonthlyLifecycleCtes = (
  escapedServiceName: string,
  escapedClinicCode: string,
  escapedClinicId: string,
  selectedYear: number
) => `
  Clinic AS (
    SELECT COALESCE(
      (
        SELECT ANY_VALUE(ClinicID)
        FROM \`great_time.MainPaymentView\`
        WHERE LOWER(ClinicCode) = LOWER('${escapedClinicCode}')
      ),
      '${escapedClinicId}'
    ) AS clinic_id
  ),
  OrderItemsInYear AS (
    SELECT
      o.id AS order_pk,
      o.order_id AS order_number,
      o.created_at,
      CAST(o.net_total AS FLOAT64) AS order_net_total,
      oi.id AS order_item_id,
      oi.service_id,
      oi.service_package_id,
      CAST(oi.total AS FLOAT64) AS item_total
    FROM \`great_time.orders\` o
    CROSS JOIN Clinic c
    JOIN \`great_time.order_items\` oi ON oi.order_id = o.id
    WHERE o.clinic_id = c.clinic_id
      AND EXTRACT(
        YEAR FROM DATETIME(TIMESTAMP(o.created_at), 'Asia/Yangon')
      ) = ${selectedYear}
  ),
  DirectServiceItems AS (
    SELECT DISTINCT
      a.order_pk,
      a.order_number,
      a.created_at,
      a.order_net_total,
      a.item_total,
      a.order_item_id
    FROM OrderItemsInYear a
    JOIN \`great_time.ServicesView\` s ON s.id = a.service_id
    WHERE a.service_id IS NOT NULL
      AND LOWER(TRIM(s.name)) = LOWER('${escapedServiceName}')
  ),
  PackageServiceItems AS (
    SELECT DISTINCT
      a.order_pk,
      a.order_number,
      a.created_at,
      a.order_net_total,
      a.item_total,
      a.order_item_id
    FROM OrderItemsInYear a
    JOIN \`great_time.service_packages\` sp ON sp.id = a.service_package_id
    JOIN \`great_time.service_package_items\` spi ON spi.service_package_id = a.service_package_id
    LEFT JOIN \`great_time.ServicesView\` s ON s.id = spi.service_id
    WHERE a.service_id IS NULL
      AND a.service_package_id IS NOT NULL
      AND LOWER(TRIM(COALESCE(NULLIF(s.name, ''), NULLIF(spi.name, ''), sp.name))) = LOWER('${escapedServiceName}')
  ),
  PackageFallbackItems AS (
    SELECT DISTINCT
      a.order_pk,
      a.order_number,
      a.created_at,
      a.order_net_total,
      a.item_total,
      a.order_item_id
    FROM OrderItemsInYear a
    JOIN \`great_time.service_packages\` sp ON sp.id = a.service_package_id
    WHERE a.service_id IS NULL
      AND a.service_package_id IS NOT NULL
      AND LOWER(TRIM(sp.name)) = LOWER('${escapedServiceName}')
      AND NOT EXISTS (
        SELECT 1
        FROM \`great_time.service_package_items\` spi
        WHERE spi.service_package_id = a.service_package_id
      )
  ),
  ServiceActivity AS (
    SELECT * FROM DirectServiceItems
    UNION ALL
    SELECT * FROM PackageServiceItems
    UNION ALL
    SELECT * FROM PackageFallbackItems
  ),
  ClassifiedActivity AS (
    SELECT
      *,
      CASE
        WHEN STARTS_WITH(UPPER(order_number), 'CO-')
          AND IFNULL(order_net_total, 0) = 0
          THEN 'TREATMENT_RETURN'
        WHEN IFNULL(order_net_total, 0) > 0
          AND IFNULL(item_total, 0) > 0
          THEN 'NEW_PURCHASE'
        ELSE 'OTHER'
      END AS activity_type
    FROM ServiceActivity
  ),
  MonthlyLifecycle AS (
    SELECT
      FORMAT_DATETIME(
        '%Y-%m',
        DATETIME(TIMESTAMP(created_at), 'Asia/Yangon')
      ) AS month,
      COUNT(DISTINCT IF(activity_type = 'TREATMENT_RETURN', order_pk, NULL)) AS treatmentReturns,
      COUNT(DISTINCT IF(activity_type = 'NEW_PURCHASE', order_pk, NULL)) AS newPurchases,
      COUNT(DISTINCT IF(activity_type IN ('TREATMENT_RETURN', 'NEW_PURCHASE'), order_pk, NULL)) AS totalActivity,
      ROUND(
        SAFE_DIVIDE(
          COUNT(DISTINCT IF(activity_type = 'TREATMENT_RETURN', order_pk, NULL)),
          COUNT(DISTINCT IF(activity_type IN ('TREATMENT_RETURN', 'NEW_PURCHASE'), order_pk, NULL))
        ) * 100,
        1
      ) AS returnShare
    FROM ClassifiedActivity
    WHERE activity_type IN ('TREATMENT_RETURN', 'NEW_PURCHASE')
    GROUP BY month
  )
`;

const ServiceDetails: React.FC<ServiceDetailsProps> = React.memo(() => {
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();
  const theme = useTheme();
  const { currentClinic } = useClinic();
  const [loading, setLoading] = React.useState(true);
  const [serviceData, setServiceData] = React.useState<ServiceData | null>(null);
  const [error, setError] = React.useState('');
  const [imageError, setImageError] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(12);
  const [selectedMonth, setSelectedMonth] = React.useState<string>('');
  const [selectedYear, setSelectedYear] = React.useState<number>(() => {
    return new Date().getFullYear();
  });
  const [recordsPage, setRecordsPage] = React.useState(0);
  const recordsPerPage = 10;
  const [filteredServiceRecords, setFilteredServiceRecords] = useState<ServiceRecord[]>([]);
  const [yearDataLoading, setYearDataLoading] = React.useState(false);
  const [yearDataError, setYearDataError] = React.useState('');
  const loadedYearRef = useRef<number | null>(null);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage - 1);
  };

  const handleChangeRowsPerPage = (event: SelectChangeEvent<number>) => {
    setRowsPerPage(parseInt(event.target.value.toString(), 10));
    setPage(0);
  };

  const handleRecordsPageChange = useCallback((_event: unknown, newPage: number) => {
    setRecordsPage(newPage - 1);
  }, []);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleYearChange = (event: SelectChangeEvent<number>) => {
    const nextYear = Number(event.target.value);
    setSelectedYear(nextYear);
    loadedYearRef.current = null;
    setServiceData((previous) => previous ? {
      ...previous,
      monthlySales: fillCalendarYear([], nextYear),
      monthlyLifecycle: fillLifecycleYear([], nextYear),
    } : previous);
    setSelectedMonth('');
    setPage(0);
    setRecordsPage(0);
  };

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => currentYear - 5 + i);
  }, []);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `Appointments: ${context.raw}`
        },
        backgroundColor: theme.palette.background.paper,
        titleColor: theme.palette.text.primary,
        bodyColor: theme.palette.text.primary,
        borderColor: theme.palette.primary.main,
        borderWidth: 1
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          color: theme.palette.text.secondary
        },
        grid: {
          color: theme.palette.divider
        },
        title: {
          display: true,
          text: 'Number of Appointments',
          color: theme.palette.text.secondary
        }
      },
      x: {
        ticks: {
          color: theme.palette.text.secondary,
          maxRotation: 45,
          minRotation: 45
        },
        grid: {
          color: theme.palette.divider
        }
      }
    }
  }), [theme]);

  const chartData = useMemo((): ChartData<'bar'> => {
    if (!serviceData?.monthlySales) return {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: theme.palette.primary.main,
        borderColor: theme.palette.primary.main,
        borderWidth: 1
      }]
    };

    return {
      labels: serviceData.monthlySales.map((sale: MonthlySale) => {
        const [year, month] = sale.month.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: 'short'
        }).format(date);
      }),
      datasets: [{
        data: serviceData.monthlySales.map((sale: MonthlySale) => sale.count),
        backgroundColor: theme.palette.primary.main,
        borderColor: theme.palette.primary.light,
        borderWidth: 1
      }]
    };
  }, [serviceData?.monthlySales, theme]);

  const demandMetrics = useMemo(() => {
    const monthlySales = serviceData?.monthlySales || [];
    const totalBookings = monthlySales.reduce((sum, month) => sum + Number(month.count || 0), 0);
    return { totalBookings };
  }, [serviceData?.monthlySales]);

  const lifecycleMetrics = useMemo(() => {
    const monthlyLifecycle = serviceData?.monthlyLifecycle || [];
    const treatmentReturns = monthlyLifecycle.reduce((sum, month) => sum + month.treatmentReturns, 0);
    const newPurchases = monthlyLifecycle.reduce((sum, month) => sum + month.newPurchases, 0);
    const totalActivity = treatmentReturns + newPurchases;
    const peakMonth = monthlyLifecycle.reduce<MonthlyLifecycle | null>((peak, month) => {
      if (!peak || month.totalActivity > peak.totalActivity) return month;
      return peak;
    }, null);
    const returnShare = totalActivity ? (treatmentReturns / totalActivity) * 100 : 0;

    let signalTitle = 'No lifecycle activity';
    let signalDetail = `No qualifying purchases or treatment returns were found in ${selectedYear}.`;
    if (totalActivity > 0 && newPurchases === 0) {
      signalTitle = 'Utilization without new sales';
      signalDetail = 'Treatment-return orders were recorded, but this service has no new purchase orders. Review re-purchase timing and sales follow-up.';
    } else if (returnShare >= 80) {
      signalTitle = 'Re-purchase opportunity';
      signalDetail = 'Most classified orders are treatment returns using earlier purchases. Monitor remaining balances and contact customers before their treatment plans finish.';
    } else if (newPurchases > treatmentReturns) {
      signalTitle = 'Purchase-led growth';
      signalDetail = 'New purchase orders exceed treatment-return orders. Protect delivery capacity and monitor whether customers return to complete their treatment plans.';
    } else if (totalActivity > 0) {
      signalTitle = 'Balanced sales and utilization';
      signalDetail = 'The service has a mix of new purchase and treatment-return orders. Continue monitoring monthly conversion and completion patterns.';
    }

    return { treatmentReturns, newPurchases, totalActivity, returnShare, peakMonth, signalTitle, signalDetail };
  }, [selectedYear, serviceData?.monthlyLifecycle]);

  const lifecycleChartData = useMemo((): ChartData<'bar'> => {
    const monthlyLifecycle = serviceData?.monthlyLifecycle || [];
    const labels = monthlyLifecycle.map((item) => {
      const [year, month] = item.month.split('-');
      return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short' })
        .format(new Date(Number(year), Number(month) - 1, 1));
    });

    return {
      labels,
      datasets: [
        {
          label: 'Treatment Returns',
          data: monthlyLifecycle.map((item) => item.treatmentReturns),
          backgroundColor: theme.palette.primary.main,
          borderColor: theme.palette.primary.main,
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'New Purchases',
          data: monthlyLifecycle.map((item) => item.newPurchases),
          backgroundColor: theme.palette.warning.main,
          borderColor: theme.palette.warning.main,
          borderWidth: 1,
          borderRadius: 4,
        }
      ]
    };
  }, [serviceData?.monthlyLifecycle, theme]);

  const lifecycleChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        align: 'start' as const,
        labels: { color: theme.palette.text.primary, usePointStyle: true, boxWidth: 8 }
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ${Number(context.raw || 0).toLocaleString()} orders`,
          footer: (items: any[]) => {
            const total = items.reduce((sum, item) => sum + Number(item.raw || 0), 0);
            return `Total orders: ${total.toLocaleString()}`;
          }
        },
        backgroundColor: theme.palette.background.paper,
        titleColor: theme.palette.text.primary,
        bodyColor: theme.palette.text.primary,
        footerColor: theme.palette.text.secondary,
        borderColor: theme.palette.divider,
        borderWidth: 1
      }
    },
    scales: {
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: { precision: 0, color: theme.palette.text.secondary },
        grid: { color: theme.palette.divider },
        title: { display: true, text: 'Distinct Orders', color: theme.palette.text.secondary }
      },
      x: {
        stacked: true,
        ticks: { color: theme.palette.text.secondary, maxRotation: 0, minRotation: 0 },
        grid: { display: false }
      }
    }
  }), [theme]);

  const handleMonthChange = useCallback((event: SelectChangeEvent<string>) => {
    setSelectedMonth(event.target.value);
  }, []);

  useEffect(() => {
    if (serviceData?.serviceRecords) {
      const filtered = serviceData.serviceRecords.filter((record: ServiceRecord) => {
        const recordMonth = record.month || record.check_in_date?.substring(0, 7);
        return selectedMonth === ''
          ? recordMonth?.startsWith(String(selectedYear))
          : selectedMonth === recordMonth;
      });
      setFilteredServiceRecords(filtered);
      setRecordsPage(0); // Reset to first page when filter changes
    }
  }, [selectedMonth, selectedYear, serviceData?.serviceRecords]);

  React.useEffect(() => {
    const fetchServiceData = async () => {
      if (!name || !currentClinic) {
        setError('Service name is required and clinic must be selected');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const decodedServiceName = decodeURIComponent(name);

        // Escape single quotes in service name by doubling them to prevent SQL injection
        const escapedServiceName = decodedServiceName.replace(/'/g, "''");
        const escapedClinicCode = currentClinic.code.replace(/'/g, "''");
        const escapedClinicId = currentClinic.id.replace(/'/g, "''");
        const monthlyLifecycleCtes = buildMonthlyLifecycleCtes(
          escapedServiceName,
          escapedClinicCode,
          escapedClinicId,
          selectedYear
        );

        // First, fetch service profile
        const profileQuery = `
WITH ServiceStats AS (
  SELECT
    ServiceName,
    MAX(ServiceImage) AS ServiceImage,
    COUNT(DISTINCT BookingID) as total_bookings,
    COUNT(DISTINCT CustomerName) as total_customers,
    CAST(SUM(CAST(Price AS FLOAT64)) AS INT64) as total_revenue
  FROM great_time.MainDataView
  WHERE ServiceName = '${escapedServiceName}'
  AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
  GROUP BY ServiceName
)
SELECT
  ServiceName as name,
  ServiceStats.ServiceImage as image,
  COALESCE(MAX(ServiceDescription), 'No description available') as description,
  total_bookings,
  total_customers,
  total_revenue,
  FORMAT_TIMESTAMP('%d %b, %Y %I:%M %p', MAX(CheckInTime)) AS last_booking_date
FROM great_time.MainDataView
JOIN ServiceStats USING (ServiceName)
WHERE ServiceName = '${escapedServiceName}'
AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
GROUP BY ServiceName, ServiceStats.ServiceImage, total_bookings, total_customers, total_revenue;`;

        const profileResponse = await axios.post(`${import.meta.env.VITE_API_URL}/query`,
          { query: profileQuery },
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        if (!profileResponse.data.success || !profileResponse.data.data[0]) {
          throw new Error('Service profile not found');
        }

        const profile = profileResponse.data.data[0];

        // Then fetch other data
        const dataQuery = `
WITH MonthlySales AS (
  SELECT
    FORMAT_DATE('%Y-%m', DATE(CheckInTime)) AS month,
    COUNT(DISTINCT BookingID) as count
  FROM great_time.MainDataView
  WHERE ServiceName = '${escapedServiceName}'
  AND EXTRACT(YEAR FROM CheckInTime) = ${selectedYear}
  AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
  GROUP BY month
  ORDER BY month
),

${monthlyLifecycleCtes},

BoughtTogether AS (
  SELECT
    b2.ServiceName as service_name,
    COUNT(DISTINCT b1.BookingID) as bought_together_count
  FROM great_time.MainDataView b1
  JOIN great_time.MainDataView b2
    ON b1.BookingID = b2.BookingID
    AND b1.ServiceName = '${escapedServiceName}'
    AND b2.ServiceName != '${escapedServiceName}'
    AND LOWER(b1.ClinicCode) = LOWER('${currentClinic.code}')
    AND LOWER(b2.ClinicCode) = LOWER('${currentClinic.code}')
  GROUP BY b2.ServiceName
  ORDER BY bought_together_count DESC
  LIMIT 10
),

Therapists AS (
  SELECT
    PractitionerName as name,
    COUNT(*) as service_count
  FROM great_time.MainDataView
  WHERE ServiceName = '${escapedServiceName}'
    AND PractitionerName IS NOT NULL
    AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
  GROUP BY PractitionerName
  ORDER BY service_count DESC
),

Customers AS (
  -- Get count of purchases per customer for the service
  WITH Purchases AS (
    SELECT
      CustomerName AS name,
      CustomerPhoneNumber AS phone,
      COUNT(*) AS purchase_count
    FROM great_time.MainDataView
    WHERE ServiceName = '${escapedServiceName}'
      AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
    GROUP BY name, phone
  ),
  -- Get the latest package/remaining counts per customer for this service
  LatestCounts AS (
    SELECT
      CustomerName AS name,
      CustomerPhoneNumber AS phone,
      ARRAY_AGG(STRUCT(
        PackageCount AS pkg,
        RemainingPackageCount AS rem,
        CheckInTime
      ) ORDER BY CheckInTime DESC LIMIT 1)[OFFSET(0)] AS latest
    FROM great_time.MainDataView
    WHERE ServiceName = '${escapedServiceName}'
      AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
    GROUP BY name, phone
  )
  SELECT
    p.name,
    p.phone,
    p.purchase_count,
    l.latest.pkg AS package_count,
    l.latest.rem AS remaining_count
  FROM Purchases p
  LEFT JOIN LatestCounts l USING (name, phone)
  ORDER BY p.purchase_count DESC
  LIMIT 100
),

ServiceRecords AS (
  SELECT
    FORMAT_TIMESTAMP('%d %b, %Y %I:%M %p', CheckInTime) as checkin_time,
    CustomerName as customer_name,
    PractitionerName as therapist_name,
    FORMAT_DATE('%Y-%m', DATE(CheckInTime)) as month
  FROM great_time.MainDataView
  WHERE ServiceName = '${escapedServiceName}'
  AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
  ORDER BY CheckInTime DESC
  LIMIT 500
)

SELECT
  ARRAY(SELECT AS STRUCT * FROM MonthlySales) as monthlySales,
  ARRAY(SELECT AS STRUCT * FROM MonthlyLifecycle ORDER BY month) as monthlyLifecycle,
  ARRAY(SELECT AS STRUCT * FROM BoughtTogether) as boughtTogether,
  ARRAY(SELECT AS STRUCT * FROM Therapists) as therapists,
  ARRAY(SELECT AS STRUCT * FROM Customers) as customers,
  ARRAY(SELECT AS STRUCT * FROM ServiceRecords) as serviceRecords;`;

        const dataResponse = await axios.post(`${import.meta.env.VITE_API_URL}/query`,
          { query: dataQuery },
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        if (!dataResponse.data.success) {
          throw new Error(dataResponse.data.error || 'Failed to fetch service data');
        }

        const result = dataResponse.data.data[0];
        if (!result) {
          throw new Error('Service data not found');
        }

        setServiceData({
          ...profile,
          monthlySales: fillCalendarYear(result.monthlySales || [], selectedYear),
          monthlyLifecycle: fillLifecycleYear(result.monthlyLifecycle || [], selectedYear),
          boughtTogether: result.boughtTogether,
          therapists: result.therapists,
          customers: result.customers,
          serviceRecords: result.serviceRecords || []
        });
        loadedYearRef.current = selectedYear;

      } catch (err: any) {
        console.error('Error fetching service data:', err);
        let errorMessage = 'Failed to fetch service data';

        if (err.response?.data?.error) {
          errorMessage = `Server error: ${err.response.data.error}`;
        } else if (err.response?.status === 400) {
          // Specific handling for 400 Bad Request
          const responseText = err.response?.data ? JSON.stringify(err.response.data) : 'No details available';
          errorMessage = `Bad request (400): ${responseText}. This may be due to invalid characters in the service name.`;
          console.error('Query that caused error:', {
            serviceName: name,
            decodedName: decodeURIComponent(name),
            escapedName: decodeURIComponent(name).replace(/'/g, "''")
          });
        } else if (err.response?.status === 500) {
          errorMessage = 'Internal server error. Please try again later.';
        } else if (err.code === 'ECONNREFUSED') {
          errorMessage = 'Unable to connect to the server. Please check if the backend service is running.';
        } else if (err.message) {
          errorMessage = err.message;
        }

        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchServiceData();
  }, [name, currentClinic]); // Removed selectedYear dependency since most data is no longer year-filtered

  // Refresh only the selected-year demand and customer lifecycle data.
  useEffect(() => {
    if (!serviceData?.name || !name || !currentClinic || loadedYearRef.current === selectedYear) return;

    const fetchYearDependentData = async () => {
      try {
        setYearDataLoading(true);
        setYearDataError('');
        const decodedServiceName = decodeURIComponent(name);
        const escapedServiceName = decodedServiceName.replace(/'/g, "''");
        const escapedClinicCode = currentClinic.code.replace(/'/g, "''");
        const escapedClinicId = currentClinic.id.replace(/'/g, "''");
        const monthlyLifecycleCtes = buildMonthlyLifecycleCtes(
          escapedServiceName,
          escapedClinicCode,
          escapedClinicId,
          selectedYear
        );

        const yearDataQuery = `
          WITH MonthlySales AS (
          SELECT
            FORMAT_DATE('%Y-%m', DATE(CheckInTime)) AS month,
            COUNT(DISTINCT BookingID) as count
          FROM great_time.MainDataView
          WHERE ServiceName = '${escapedServiceName}'
            AND CheckInTime IS NOT NULL
            AND EXTRACT(YEAR FROM CheckInTime) = ${selectedYear}
            AND LOWER(ClinicCode) = LOWER('${currentClinic.code}')
          GROUP BY month
          ORDER BY month
          ),
          ${monthlyLifecycleCtes}
          SELECT
            ARRAY(SELECT AS STRUCT * FROM MonthlySales) AS monthlySales,
            ARRAY(SELECT AS STRUCT * FROM MonthlyLifecycle ORDER BY month) AS monthlyLifecycle
        `;

        const response = await axios.post(`${import.meta.env.VITE_API_URL}/query`,
          { query: yearDataQuery },
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        if (response.data.success && response.data.data?.[0]) {
          const yearData = response.data.data[0];
          loadedYearRef.current = selectedYear;
          setServiceData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              monthlySales: fillCalendarYear(yearData.monthlySales || [], selectedYear),
              monthlyLifecycle: fillLifecycleYear(yearData.monthlyLifecycle || [], selectedYear),
            };
          });
        } else {
          throw new Error(response.data.error || 'Unable to load yearly service performance');
        }
      } catch (error) {
        console.error('Error fetching year-dependent data:', error);
        setYearDataError('Unable to load service performance for the selected year.');
      } finally {
        setYearDataLoading(false);
      }
    };

    fetchYearDependentData();
  }, [selectedYear, name, currentClinic, serviceData?.name]);

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        height: '100vh',
        width: '100%',
        bgcolor: 'var(--surface)'
      }}>
        <CircularProgress sx={{ color: 'var(--primary)', margin: 'auto' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{
        p: 4,
        maxWidth: '800px',
        margin: '0 auto',
        textAlign: 'center',
        bgcolor: 'var(--surface)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <Typography variant="h5" sx={{ mb: 2, color: 'var(--text-primary)' }}>
          Unable to load service details
        </Typography>
        <Paper sx={{ p: 3, bgcolor: 'var(--surface-secondary)', borderRadius: '8px', mb: 3, width: '100%' }}>
          <Typography variant="body1" sx={{ color: 'var(--text-primary)', mb: 3 }}>
            {error}
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 4 }}>
            This could be due to special characters in the service name or a temporary issue with the database.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <IconButton
              sx={{
                bgcolor: 'var(--primary)',
                color: '#ffffff',
                '&:hover': { bgcolor: 'var(--primary-hover)' }
              }}
              onClick={() => navigate(-1)}
            >
              <ArrowBackIcon />
            </IconButton>
            <IconButton
              sx={{
                bgcolor: 'var(--primary)',
                color: '#ffffff',
                '&:hover': { bgcolor: 'var(--primary-hover)' }
              }}
              onClick={() => window.location.reload()}
            >
              <RefreshIcon />
            </IconButton>
          </Box>
        </Paper>
      </Box>
    );
  }

  if (!serviceData) {
    return (
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        width: '100%',
        bgcolor: 'var(--surface)',
        p: 3
      }}>
        <Typography color="var(--text-primary)" variant="h6" align="center">No service data found</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      p: { xs: 2, sm: 3, md: 4 },
      bgcolor: 'var(--background)',
      minHeight: '100vh',
      height: '100vh',
      width: '100%',
      maxWidth: '100%',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      boxSizing: 'border-box',
      m: 0,
      overflowX: 'hidden',
      overflowY: 'hidden',
      color: 'var(--text-primary)',
      fontSize: '14px'
    }}>
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        mb: 2,
        width: '100%'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            onClick={handleBack}
            aria-label="Back to services"
            sx={{
              color: 'var(--text-secondary)',
              mr: 1,
              '&:hover': { bgcolor: 'var(--surface-secondary)', color: 'var(--text-primary)' }
            }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography sx={{ color: 'var(--text-primary)', fontSize: '1.2rem', fontWeight: 750 }}>Service Performance</Typography>
            <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Demand, customers, scheduling pattern, and delivery activity</Typography>
          </Box>
        </Box>
      </Box>

      {/* Main scrollable content container */}
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        flexGrow: 1,
        height: 'calc(100vh - 70px)', // Adjust for header and padding
        '&::-webkit-scrollbar': {
          width: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'var(--surface)',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'var(--border)',
          borderRadius: '4px',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: 'var(--text-muted)',
        }
      }}>

      {/* Service Details Section */}
      <Paper
        elevation={3}
        sx={{
          width: '100%',
          p: { xs: 2, sm: 3 },
          bgcolor: 'var(--surface)',
          color: 'var(--text-primary)',
          mb: 3,
          borderRadius: 2,
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border)',
          boxSizing: 'border-box'
        }}
      >
        <Grid container spacing={{ xs: 2, sm: 3 }} alignItems="center">
          <Grid item xs={12} sm="auto">
            <Avatar
              src={!imageError ? serviceData.image : undefined}
              alt={serviceData.name}
              sx={{
                width: { xs: 120, sm: 160 },
                height: { xs: 120, sm: 160 },
                bgcolor: 'var(--primary)',
                fontSize: { xs: '3rem', sm: '4rem' },
                boxShadow: 'var(--shadow-md)',
                margin: { xs: '0 auto', sm: 0 }
              }}
              imgProps={{
                onError: () => {
                  setImageError(true);
                }
              }}
            >
              {(imageError || !serviceData.image) && serviceData.name?.charAt(0)?.toUpperCase()}
            </Avatar>
          </Grid>
          <Grid item xs={12} sm>
            <Typography variant="h4" sx={{
              mb: { xs: 1.5, sm: 2 },
              fontWeight: 600,
              fontSize: { xs: '1.75rem', sm: '2rem', md: '2.25rem' },
              textAlign: { xs: 'center', sm: 'left' },
              color: 'var(--text-primary)'
            }}>
              {serviceData.name}
            </Typography>
            <Typography variant="body1" sx={{
              mb: { xs: 1.5, sm: 2 },
              color: 'var(--text-secondary)',
              textAlign: { xs: 'center', sm: 'left' }
            }}>
              {serviceData.description}
            </Typography>
            <Grid container spacing={{ xs: 1.5, sm: 2, md: 3 }}>
              <Grid item xs={6} sm={6} md={3}>
                <Paper sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: 'var(--surface-secondary)', borderRadius: 2, border: '1px solid var(--border)' }}>
                  <Typography variant="body2" color="var(--text-secondary)">Lifetime Bookings</Typography>
                  <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    {serviceData.total_bookings}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <Paper sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: 'var(--surface-secondary)', borderRadius: 2, border: '1px solid var(--border)' }}>
                  <Typography variant="body2" color="var(--text-secondary)">Lifetime Customers</Typography>
                  <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    {serviceData.total_customers}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <Paper sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: 'var(--surface-secondary)', borderRadius: 2, border: '1px solid var(--border)' }}>
                  <Typography variant="body2" color="var(--text-secondary)">Lifetime Revenue</Typography>
                  <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    {formatCurrency(Number(serviceData.total_revenue || 0), currentClinic)}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={6} md={3}>
                <Paper sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: 'var(--surface-secondary)', borderRadius: 2, border: '1px solid var(--border)' }}>
                  <Typography variant="body2" color="var(--text-secondary)">Last Booking</Typography>
                  <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                    {serviceData.last_booking_date}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Paper>

      {/* Selected-year demand and behavior */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          bgcolor: 'var(--surface)',
          color: 'var(--text-primary)',
          mb: 3,
          borderRadius: 2.5,
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border)'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 2.5 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'var(--text-primary)' }}>Demand and Customer Lifecycle</Typography>
            <Typography sx={{ mt: 0.4, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Compare service demand, new purchases, and returning treatment activity during {selectedYear}.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Select
              value={selectedYear}
              onChange={handleYearChange}
              size="small"
              aria-label="Analysis year"
              sx={{
                height: '38px',
                minWidth: '120px',
                bgcolor: 'var(--surface)',
                color: 'var(--text-primary)',
                '& .MuiSelect-icon': {
                  color: 'var(--text-secondary)'
                },
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--border)'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--primary)'
                }
              }}
            >
              {yearOptions.map((year) => (
                <MenuItem key={year} value={year}>
                  {year}
                </MenuItem>
              ))}
            </Select>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1.25, mb: 3 }}>
          {[
            { label: `Appointments in ${selectedYear}`, value: demandMetrics.totalBookings.toLocaleString(), helper: 'Distinct bookings by treatment date' },
            { label: 'Treatment returns', value: lifecycleMetrics.treatmentReturns.toLocaleString(), helper: 'Distinct zero-value CO orders' },
            { label: 'New purchases', value: lifecycleMetrics.newPurchases.toLocaleString(), helper: 'Distinct positive-value orders' },
            { label: 'Return-order share', value: `${lifecycleMetrics.returnShare.toFixed(1)}%`, helper: 'Treatment returns ÷ classified orders' },
            {
              label: 'Peak lifecycle month',
              value: lifecycleMetrics.peakMonth && lifecycleMetrics.peakMonth.totalActivity > 0
                ? new Date(`${lifecycleMetrics.peakMonth.month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' })
                : 'No activity',
              helper: lifecycleMetrics.peakMonth && lifecycleMetrics.peakMonth.totalActivity > 0
                ? `${lifecycleMetrics.peakMonth.totalActivity.toLocaleString()} orders`
                : `No lifecycle activity in ${selectedYear}`,
            },
          ].map((metric) => (
            <Box key={metric.label} sx={{ p: 1.6, bgcolor: 'var(--surface-secondary)', border: '1px solid var(--border)', borderRadius: 1.75 }}>
              <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 650 }}>{metric.label}</Typography>
              <Typography sx={{ mt: 0.4, color: 'var(--text-primary)', fontSize: '1.15rem', fontWeight: 750 }}>{metric.value}</Typography>
              <Typography sx={{ mt: 0.35, color: 'var(--text-secondary)', fontSize: '0.68rem' }}>{metric.helper}</Typography>
            </Box>
          ))}
        </Box>

        {yearDataError && (
          <Box sx={{ p: 1.5, mb: 2, bgcolor: 'var(--error-soft)', border: '1px solid var(--error)', borderRadius: 1.5 }}>
            <Typography sx={{ color: 'var(--error)', fontSize: '0.82rem' }}>{yearDataError}</Typography>
          </Box>
        )}

        <Box sx={{ p: 1.75, mb: 2.5, bgcolor: 'var(--surface-secondary)', border: '1px solid var(--border)', borderRadius: 1.75 }}>
          <Typography sx={{ color: 'var(--text-primary)', fontSize: '0.78rem', fontWeight: 750 }}>
            How to compare these charts
          </Typography>
          <Typography sx={{ mt: 0.45, color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: 1.55 }}>
            Appointments are distinct bookings grouped by treatment date. Purchases and treatment returns are distinct orders grouped by the date the order was recorded. A purchase can happen before any appointment, and these order counts are not expected to match appointment counts one-for-one. All months use Myanmar time.
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography sx={{ color: 'var(--text-primary)', fontWeight: 700, mb: 0.5 }}>Appointments by treatment date</Typography>
          <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.75rem', mb: 1.5 }}>Distinct booking IDs by check-in month · Myanmar time</Typography>
        <Box sx={{ height: 300, position: 'relative' }}>
          {yearDataLoading && (
            <Box sx={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--overlay)' }}>
              <CircularProgress size={28} sx={{ color: 'var(--primary)' }} />
            </Box>
          )}
          <Bar
            data={chartData}
            options={chartOptions}
          />
        </Box>
        </Box>

        <Box sx={{ pt: 2.5, borderTop: '1px solid var(--border)' }}>
          <Box sx={{ mb: 1.5 }}>
            <Typography sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>Purchases and treatment returns by order date</Typography>
            <Typography sx={{ mt: 0.35, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
              Distinct orders by the month recorded · Myanmar time. Treatment Returns show use of an earlier purchase; New Purchases show fresh paid orders.
            </Typography>
          </Box>
          <Box sx={{ height: 320, position: 'relative' }}>
            {yearDataLoading && (
              <Box sx={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--overlay)' }}>
                <CircularProgress size={28} sx={{ color: 'var(--primary)' }} />
              </Box>
            )}
            <Bar data={lifecycleChartData} options={lifecycleChartOptions} />
          </Box>

          <Box sx={{ mt: 2, p: 1.75, bgcolor: 'var(--primary-soft)', border: '1px solid var(--border)', borderRadius: 1.75 }}>
            <Typography sx={{ color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Business signal · {lifecycleMetrics.signalTitle}
            </Typography>
            <Typography sx={{ mt: 0.45, color: 'var(--text-primary)', fontSize: '0.8rem', lineHeight: 1.55 }}>
              {lifecycleMetrics.signalDetail}
            </Typography>
          </Box>

          <Typography sx={{ mt: 1.25, color: 'var(--text-muted)', fontSize: '0.68rem' }}>
            These are order counts, not appointment or unit counts. Treatment Returns are distinct zero-value CO service orders. New Purchases are distinct positive-value service or package orders containing this service. Booking Deposit is excluded.
          </Typography>
        </Box>
      </Paper>

      {/* Customers Section */}
      <Paper
        elevation={3}
        sx={{
          p: { xs: 2, sm: 3 },
          bgcolor: 'var(--surface-secondary)',
          color: 'var(--text-primary)',
          mb: 3,
          borderRadius: 2,
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          border: '1px solid var(--border)'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            Customers who bought "{decodeURIComponent(name || '')}"
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownloadIcon />}
            onClick={() => {
              if (!serviceData?.customers || serviceData.customers.length === 0) {
                return;
              }

              // Prepare data for Excel export
              const exportData = serviceData.customers.map((customer: any) => ({
                'Name': customer.name || '-',
                'Phone': customer.phone || '-',
                'Package Count': customer.package_count ?? '-',
                'Used': customer.purchase_count || 0,
                'Remaining': customer.remaining_count ?? '-'
              }));

              // Create worksheet
              const ws = XLSX.utils.json_to_sheet(exportData);

              // Set column widths
              const colWidths = [
                { wch: 30 }, // Name
                { wch: 15 }, // Phone
                { wch: 15 }, // Package Count
                { wch: 10 }, // Used
                { wch: 15 }  // Remaining
              ];
              ws['!cols'] = colWidths;

              // Create workbook
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'Customers');

              // Generate filename with service name
              const serviceName = decodeURIComponent(name || 'service').replace(/[^a-z0-9]/gi, '_');
              const filename = `customers_${serviceName}_${new Date().toISOString().split('T')[0]}.xlsx`;

              // Download file
              XLSX.writeFile(wb, filename);
            }}
            disabled={!serviceData?.customers || serviceData.customers.length === 0}
            sx={{
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
              bgcolor: 'var(--surface-secondary)',
              '&:hover': {
                borderColor: 'var(--primary)',
                color: 'var(--primary)',
                bgcolor: 'var(--primary-soft)'
              },
              '&.Mui-disabled': {
                borderColor: 'var(--surface-secondary)',
                color: 'var(--border-strong)'
              }
            }}
          >
            Export to Excel
          </Button>
        </Box>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{
                  bgcolor: 'var(--surface-secondary)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  borderBottom: '1px solid var(--border)'
                }}>Name</TableCell>
                <TableCell sx={{
                  bgcolor: 'var(--surface-secondary)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  borderBottom: '1px solid var(--border)'
                }}>Phone</TableCell>
                <TableCell sx={{
                  bgcolor: 'var(--surface-secondary)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  borderBottom: '1px solid var(--border)'
                }}>Package Count</TableCell>
                <TableCell sx={{
                  bgcolor: 'var(--surface-secondary)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  borderBottom: '1px solid var(--border)'
                }}>Used</TableCell>
                <TableCell sx={{
                  bgcolor: 'var(--surface-secondary)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  borderBottom: '1px solid var(--border)'
                }}>Remaining</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {serviceData.customers
                ?.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((customer: any, index: number) => (
                <TableRow key={index} sx={{ '&:hover': { bgcolor: 'var(--surface-secondary)' } }}>
                  <TableCell
                    sx={{
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      '&:hover': {
                        color: 'var(--primary)',
                        textDecoration: 'underline'
                      }
                    }}
                    onClick={() => navigate(`/customers/${encodeURIComponent(customer.phone || customer.name)}`)}
                  >
                    {customer.name}
                  </TableCell>
                  <TableCell sx={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>{customer.phone}</TableCell>
                  <TableCell sx={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>{customer.package_count ?? '-'}</TableCell>
                  <TableCell sx={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>{customer.purchase_count}</TableCell>
                  <TableCell sx={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>{customer.remaining_count ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mt: 2, gap: 2 }}>
          <Select
            value={rowsPerPage}
            onChange={handleChangeRowsPerPage}
            sx={{
              color: 'var(--text-primary)',
              '& .MuiSelect-icon': { color: 'var(--text-primary)' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--text-muted)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
              bgcolor: 'var(--surface-secondary)'
            }}
            size="small"
          >
            <MenuItem value={6}>6 per page</MenuItem>
            <MenuItem value={12}>12 per page</MenuItem>
            <MenuItem value={25}>25 per page</MenuItem>
          </Select>
          <Pagination
            count={Math.ceil((serviceData.customers?.length || 0) / rowsPerPage)}
            page={page + 1}
            onChange={handleChangePage}
            sx={{
              '& .MuiPaginationItem-root': {
                color: 'var(--text-primary)',
                borderColor: 'var(--border)'
              },
              '& .MuiPaginationItem-root.Mui-selected': {
                bgcolor: 'var(--primary)',
                '&:hover': {
                  bgcolor: 'var(--primary-hover)'
                }
              }
            }}
          />
        </Box>
      </Paper>

      <Grid container spacing={3}>
        {/* Bought Together Section */}
        <Grid item xs={12} md={6}>
          <Paper
            elevation={3}
            sx={{
              p: { xs: 2, sm: 3 },
              bgcolor: 'var(--surface-secondary)',
              color: 'var(--text-primary)',
              height: '100%',
              borderRadius: 2,
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              border: '1px solid var(--border)'
            }}
          >
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>Common Service Pairings</Typography>
              <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Other services recorded in the same booking.</Typography>
            </Box>
            <TableContainer sx={{
              maxHeight: '300px',
              overflowY: 'auto',
              '&::-webkit-scrollbar': {
                width: '8px',
                height: '8px',
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: 'var(--surface-secondary)',
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: 'var(--border)',
                borderRadius: '4px',
              },
              '&::-webkit-scrollbar-thumb:hover': {
                backgroundColor: 'var(--primary)',
              }
            }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Service Name</TableCell>
                    <TableCell sx={{ color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Shared Bookings</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {serviceData.boughtTogether?.map((service: any, index: number) => (
                    <TableRow key={index} sx={{ '&:hover': { bgcolor: 'var(--surface-secondary)' } }}>
                      <TableCell
                        sx={{
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border)',
                          '&:hover': {
                            color: 'var(--primary)',
                            textDecoration: 'underline'
                          }
                        }}
                        onClick={() => navigate(`/services/${encodeURIComponent(service.service_name)}`)}
                      >
                        {service.service_name}
                      </TableCell>
                      <TableCell sx={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>{service.bought_together_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Therapists Section */}
        <Grid item xs={12} md={6}>
          <Paper
            elevation={3}
            sx={{
              p: { xs: 2, sm: 3 },
              bgcolor: 'var(--surface-secondary)',
              color: 'var(--text-primary)',
              height: '100%',
              borderRadius: 2,
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              border: '1px solid var(--border)'
            }}
          >
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>Top Therapists</Typography>
              <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Lifetime service delivery count by practitioner.</Typography>
            </Box>
            <TableContainer sx={{
              maxHeight: '300px',
              overflowY: 'auto',
              '&::-webkit-scrollbar': {
                width: '8px',
                height: '8px',
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: 'var(--surface-secondary)',
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: 'var(--border)',
                borderRadius: '4px',
              },
              '&::-webkit-scrollbar-thumb:hover': {
                backgroundColor: 'var(--primary)',
              }
            }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Name</TableCell>
                    <TableCell sx={{ color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Service Count</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {serviceData.therapists?.map((therapist: any, index: number) => (
                    <TableRow key={index} sx={{ '&:hover': { bgcolor: 'var(--surface-secondary)' } }}>
                      <TableCell
                        sx={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', cursor: 'pointer', '&:hover': { color: 'var(--primary)', textDecoration: 'underline' } }}
                        onClick={() => navigate(`/therapists/${encodeURIComponent(therapist.name)}`)}
                      >
                        {therapist.name}
                      </TableCell>
                      <TableCell sx={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>{therapist.service_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Service Records Section */}
        <Grid item xs={12}>
          <Paper
            elevation={3}
            sx={{
              p: { xs: 2, sm: 3 },
              bgcolor: 'var(--surface-secondary)',
              color: 'var(--text-primary)',
              borderRadius: 2,
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              border: '1px solid var(--border)'
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>Service Records · {selectedYear}</Typography>
                <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Most recent 500 records are loaded for responsive browsing.</Typography>
              </Box>
              <Select
                value={selectedMonth}
                onChange={handleMonthChange}
                sx={{
                  minWidth: 200,
                  color: 'var(--text-primary)',
                  '& .MuiSelect-icon': { color: 'var(--text-primary)' },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--text-muted)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
                  bgcolor: 'var(--surface-secondary)'
                }}
                size="small"
              >
                <MenuItem value="">All months in {selectedYear}</MenuItem>
                {serviceData?.monthlySales?.map((sale: MonthlySale) => (
                  <MenuItem key={sale.month} value={sale.month}>
                    {new Date(sale.month + '-01').toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long'
                    })}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <TableContainer sx={{
              maxHeight: '400px',
              overflowY: 'auto',
              '&::-webkit-scrollbar': {
                width: '8px',
                height: '8px',
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: 'var(--surface-secondary)',
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: 'var(--border)',
                borderRadius: '4px',
              },
              '&::-webkit-scrollbar-thumb:hover': {
                backgroundColor: 'var(--primary)',
              }
            }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        minWidth: '180px',
                        borderBottom: '1px solid var(--border)'
                      }}
                    >
                      Check-in Time
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        minWidth: '200px',
                        borderBottom: '1px solid var(--border)'
                      }}
                    >
                      Customer
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: 'var(--surface-secondary)',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        minWidth: '200px',
                        borderBottom: '1px solid var(--border)'
                      }}
                    >
                      Therapist
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredServiceRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 5, color: 'var(--text-secondary)', borderBottom: 0 }}>
                        No service records found for {selectedMonth || selectedYear}.
                      </TableCell>
                    </TableRow>
                  ) : filteredServiceRecords
                    .slice(recordsPage * recordsPerPage, (recordsPage + 1) * recordsPerPage)
                    .map((record: any, index: number) => (
                      <TableRow key={index} sx={{ '&:hover': { bgcolor: 'var(--surface-secondary)' } }}>
                        <TableCell sx={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>
                          {record.checkin_time}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border)',
                            '&:hover': {
                              color: 'var(--primary)',
                              textDecoration: 'underline'
                            }
                          }}
                          onClick={() => {
                            // Look for phone in record or find it in the service data
                            const customerPhone = record.phone ||
                              // Try to find the phone number from the customers array if available
                              (serviceData.customers?.find(c => c.name === record.customer_name)?.phone) ||
                              record.customer_name;
                            navigate(`/customers/${encodeURIComponent(customerPhone)}`);
                          }}
                        >
                          {record.customer_name}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border)',
                            '&:hover': {
                              color: 'var(--primary)',
                              textDecoration: 'underline'
                            }
                          }}
                          onClick={() => navigate(`/therapists/${encodeURIComponent(record.therapist_name)}`)}
                        >
                          {record.therapist_name}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              mt: 2,
              gap: 2
            }}>
              <Typography sx={{ color: 'var(--text-secondary)' }}>
                {filteredServiceRecords.length === 0
                  ? '0 of 0'
                  : `${recordsPage * recordsPerPage + 1}-${Math.min((recordsPage + 1) * recordsPerPage, filteredServiceRecords.length)} of ${filteredServiceRecords.length}`}
              </Typography>
              <Pagination
                count={Math.max(1, Math.ceil(filteredServiceRecords.length / recordsPerPage))}
                page={recordsPage + 1}
                onChange={handleRecordsPageChange}
                sx={{
                  '& .MuiPaginationItem-root': {
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border)'
                  },
                  '& .MuiPaginationItem-root.Mui-selected': {
                    bgcolor: 'var(--primary)',
                    '&:hover': {
                      bgcolor: 'var(--primary-hover)'
                    }
                  }
                }}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>
      </Box> {/* End of scrollable container */}
    </Box>
  );
});

export default ServiceDetails;
