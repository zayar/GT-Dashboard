export const CUSTOMER_TIME_ZONE = 'Asia/Yangon';

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const uppercaseMeridiem = (value: string): string => value.replace(/\b(am|pm)\b/gi, (part) => part.toUpperCase());

export const formatCustomerEventDate = (value?: string | null) => {
  const date = parseDate(value);
  if (!date) return { day: '—', month: 'No date', time: '' };

  return {
    day: new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      timeZone: CUSTOMER_TIME_ZONE,
    }).format(date),
    month: new Intl.DateTimeFormat('en-GB', {
      month: 'short',
      timeZone: CUSTOMER_TIME_ZONE,
    }).format(date),
    time: uppercaseMeridiem(new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: CUSTOMER_TIME_ZONE,
    }).format(date)),
  };
};

export const formatCustomerDateTime = (value?: string | null): string => {
  const date = parseDate(value);
  if (!date) return 'Date not recorded';

  const datePart = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: CUSTOMER_TIME_ZONE,
  }).format(date);
  const timePart = uppercaseMeridiem(new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: CUSTOMER_TIME_ZONE,
  }).format(date));

  return `${datePart}, ${timePart} (Yangon)`;
};

export const formatProcedureDateTime = (value?: string | null): string => {
  const date = parseDate(value);
  if (!date) return 'Procedure time not recorded';

  const datePart = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: CUSTOMER_TIME_ZONE,
  }).format(date);
  const timePart = uppercaseMeridiem(new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: CUSTOMER_TIME_ZONE,
  }).format(date));

  return `${datePart} · ${timePart} Yangon time`;
};
