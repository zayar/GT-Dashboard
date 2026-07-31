import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export type StaffFilterType = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface StaffReportPeriod {
  startDate: Date;
  endDate: Date;
}

interface GetStaffReportPeriodOptions {
  filterType: StaffFilterType;
  selectedDate: Date;
  customStartDate: Date | null;
  customEndDate: Date | null;
}

export const getStaffReportPeriod = ({
  filterType,
  selectedDate,
  customStartDate,
  customEndDate,
}: GetStaffReportPeriodOptions): StaffReportPeriod | null => {
  if (filterType === 'custom') {
    if (!customStartDate || !customEndDate) return null;

    const period = {
      startDate: startOfDay(customStartDate),
      endDate: endOfDay(customEndDate),
    };

    return period.startDate <= period.endDate ? period : null;
  }

  if (filterType === 'weekly') {
    return {
      startDate: startOfWeek(selectedDate, { weekStartsOn: 1 }),
      endDate: endOfWeek(selectedDate, { weekStartsOn: 1 }),
    };
  }

  if (filterType === 'monthly') {
    return {
      startDate: startOfMonth(selectedDate),
      endDate: endOfMonth(selectedDate),
    };
  }

  return {
    startDate: startOfDay(selectedDate),
    endDate: endOfDay(selectedDate),
  };
};

export const buildStaffDateCondition = (period: StaffReportPeriod): string => {
  const startDate = format(period.startDate, 'yyyy-MM-dd');
  const endDate = format(period.endDate, 'yyyy-MM-dd');

  return `DATE(CheckInTime) BETWEEN DATE('${startDate}') AND DATE('${endDate}')`;
};
