import { endOfDay, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek } from 'date-fns';

export const MERCHANT_CANCEL_STATUS = 'Merchant Cancel';
export const ORDER_CANCEL_STATUS = 'Cancel Order';
export const DEFAULT_CHECK_IN_OUT_STATUS_FILTER = 'active_records';
export const MYANMAR_TIME_LABEL = 'Myanmar Time (UTC+06:30)';

export type CheckInOutDateRange = 'day' | 'week' | 'month' | 'custom';

export type CheckInOutStatusFilter =
  | typeof DEFAULT_CHECK_IN_OUT_STATUS_FILTER
  | 'all'
  | 'PAID'
  | 'UNPAID'
  | 'PARTIAL_PAID'
  | typeof ORDER_CANCEL_STATUS
  | typeof MERCHANT_CANCEL_STATUS;

interface CheckInOutDateRangeBoundsOptions {
  dateRange: CheckInOutDateRange;
  reportDate: Date | null;
  customStartDate: Date | null;
  customEndDate: Date | null;
}

export interface CheckInOutDateRangeBounds {
  startDate: Date;
  endDate: Date;
}

export const parseReportDateTime = (dateTimeString: string | null): Date | null => {
  if (!dateTimeString) {
    return null;
  }

  const match = dateTimeString
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  const parsedDate = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

// APICORE getBookingDetails converts UTC to Myanmar time before returning its
// DATETIME values. GraphQL may append "Z" while serializing them, so these
// appointment values must remain wall-clock times rather than be converted again.
export const formatReportDateTime = (dateTimeString: string | null): string => {
  const parsedDate = parseReportDateTime(dateTimeString);

  return parsedDate ? format(parsedDate, 'yyyy-MM-dd hh:mm a') : '-';
};

export const formatAppointmentDateTime = (dateTimeString: string | null): string => {
  const parsedDate = parseReportDateTime(dateTimeString);

  return parsedDate ? format(parsedDate, 'MMM d, h:mm a') : '-';
};

export const formatGraphqlDateTimeInMyanmar = (dateTimeString: string | null): string => {
  if (!dateTimeString) {
    return '-';
  }

  const parsedDate = new Date(dateTimeString);
  if (Number.isNaN(parsedDate.getTime())) {
    return '-';
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Yangon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(parsedDate);
  const valueByPart = new Map(parts.map((part) => [part.type, part.value]));

  return [
    `${valueByPart.get('year')}-${valueByPart.get('month')}-${valueByPart.get('day')}`,
    `${valueByPart.get('hour')}:${valueByPart.get('minute')} ${valueByPart.get('dayPeriod')}`,
  ].join(' ');
};

export const formatCheckInOutPhoneNumber = (
  phoneNumber: string | null | undefined,
  currency: string,
): string => {
  if (!phoneNumber) {
    return '';
  }

  if (currency === 'USD' && phoneNumber.startsWith('+855')) {
    return `0${phoneNumber.substring(4)}`;
  }

  if (currency === 'MMK' && phoneNumber.startsWith('+95')) {
    return `0${phoneNumber.substring(3)}`;
  }

  return phoneNumber;
};

export const formatPhoneNumberForSpreadsheet = (phoneNumber: string): string => {
  if (!phoneNumber) {
    return '';
  }

  // Excel and Google Sheets otherwise coerce long phone numbers to numeric
  // cells, dropping the leading zero or showing scientific notation.
  return /^[+0-9 ()-]+$/.test(phoneNumber)
    ? `="${phoneNumber}"`
    : phoneNumber;
};

export const getCheckInOutDateRangeBounds = ({
  dateRange,
  reportDate,
  customStartDate,
  customEndDate,
}: CheckInOutDateRangeBoundsOptions): CheckInOutDateRangeBounds | null => {
  if (dateRange === 'custom') {
    if (!customStartDate || !customEndDate) {
      return null;
    }

    const startDate = startOfDay(customStartDate);
    const endDate = endOfDay(customEndDate);

    if (startDate.getTime() > endDate.getTime()) {
      return null;
    }

    return { startDate, endDate };
  }

  if (!reportDate) {
    return null;
  }

  switch (dateRange) {
    case 'day':
      return {
        startDate: startOfDay(reportDate),
        endDate: endOfDay(reportDate),
      };
    case 'week':
      return {
        startDate: startOfWeek(reportDate, { weekStartsOn: 1 }),
        endDate: endOfWeek(reportDate, { weekStartsOn: 1 }),
      };
    case 'month':
      return {
        startDate: startOfMonth(reportDate),
        endDate: endOfMonth(reportDate),
      };
    default:
      return null;
  }
};
