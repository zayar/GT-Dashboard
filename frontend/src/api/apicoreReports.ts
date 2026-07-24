import {
  DEFAULT_CHECK_IN_OUT_STATUS_FILTER,
  MERCHANT_CANCEL_STATUS,
  ORDER_CANCEL_STATUS,
  type CheckInOutStatusFilter,
} from '../utils/checkInOutReport';

const API_BASE_URL = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');
const APICORE_GRAPHQL_URL = (
  import.meta.env.VITE_APICORE_GRAPHQL_URL
  || (API_BASE_URL ? `${API_BASE_URL}/apicore` : '')
).replace(/\/+$/, '');

const REPORT_BATCH_SIZE = 500;
const ORDER_ITEM_BATCH_SIZE = 200;
const MAX_REPORT_ROWS = 50_000;
const MYANMAR_OFFSET_MINUTES = 6 * 60 + 30;

export type BookingStatus =
  | 'REQUEST'
  | 'BOOKED'
  | 'CHECKIN'
  | 'CHECKOUT'
  | 'MEMBER_CANCEL'
  | 'MERCHANT_CANCEL'
  | 'NO_SHOW';

export interface AppointmentRecord {
  bookingid: string;
  FromTime: string | null;
  ToTime: string | null;
  ServiceName: string;
  MemberName: string | null;
  MemberPhoneNumber: string;
  PractitionerName: string;
  ClinicName: string;
  ClinicCode: string | null;
  ClinicID: string;
  HelperName: string | null;
  status: BookingStatus | string;
  member_note: string | null;
}

export interface CheckInOutRecord {
  id: string;
  OrderId: string | null;
  CheckInTime: string | null;
  CheckOutTime: string | null;
  Servicename: string;
  TherapicName: string;
  HelperName: string | null;
  CustomerName: string | null;
  CustomerPhoneNumber: string;
  PaymentMethod: string | null;
  PaymentStatus: string | null;
  Total: number | null;
  Discount: number | null;
  SellerName: string | null;
  VisitStatus: string;
  OrderStatus: string | null;
  BookingStatus: string | null;
}

interface GraphqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface BookingDetailsResponse {
  getBookingDetails?: {
    data?: AppointmentRecord[];
    totalCount?: number;
  } | null;
}

interface RawCheckInRow {
  id: string;
  in_time: string;
  out_time?: string | null;
  status: string;
  isUsePurchaseService?: boolean | null;
  order_id?: string | null;
  service?: {
    id?: string | null;
    name?: string | null;
    price?: number | string | null;
  } | null;
  practitioner?: {
    name?: string | null;
  } | null;
  member?: {
    name?: string | null;
    phonenumber?: string | null;
    clinic_members?: Array<{
      name?: string | null;
      phonenumber?: string | null;
    }> | null;
  } | null;
  booking?: {
    status?: string | null;
    service_helper?: {
      name?: string | null;
    } | null;
  } | null;
  orders?: {
    order_id?: string | null;
    discount?: number | string | null;
    payment_method?: string | null;
    payment_status?: string | null;
    status?: string | null;
    seller?: {
      display_name?: string | null;
    } | null;
  } | null;
  helper?: {
    name?: string | null;
  } | null;
}

interface CheckInsResponse {
  checkIns?: RawCheckInRow[];
  aggregateCheckIn?: {
    _count?: {
      _all?: number | null;
    } | null;
  } | null;
}

interface RawOrderItem {
  id: string;
  order_id: string;
  service_id?: string | null;
  price?: number | string | null;
  total?: number | string | null;
}

interface OrderItemsResponse {
  orderItems?: RawOrderItem[];
}

const GET_BOOKING_DETAILS = `
  query GetBookingDetails(
    $clinicCode: String!
    $startDate: DateTime!
    $endDate: DateTime!
    $status: BookingStatus
    $skip: Int
    $take: Int
  ) {
    getBookingDetails(
      clinicCode: $clinicCode
      startDate: $startDate
      endDate: $endDate
      status: $status
      skip: $skip
      take: $take
    ) {
      data {
        bookingid
        FromTime
        ToTime
        ServiceName
        MemberName
        MemberPhoneNumber
        PractitionerName
        ClinicName
        ClinicCode
        ClinicID
        HelperName
        status
        member_note
      }
      totalCount
    }
  }
`;

const GET_CHECKIN_OUT_DATA = `
  query CheckInOutData(
    $where: CheckInWhereInput
    $orderBy: [CheckInOrderByWithRelationInput!]
    $take: Int
    $skip: Int
    $clinicMembersWhere2: ClinicMemberWhereInput
  ) {
    checkIns(where: $where, orderBy: $orderBy, take: $take, skip: $skip) {
      id
      in_time
      out_time
      status
      isUsePurchaseService
      order_id
      service {
        id
        name
        price
      }
      practitioner {
        name
      }
      member {
        name
        phonenumber
        clinic_members(where: $clinicMembersWhere2) {
          name
          phonenumber
        }
      }
      booking {
        status
        service_helper {
          name
        }
      }
      orders {
        order_id
        discount
        payment_method
        payment_status
        status
        seller {
          display_name
        }
      }
      helper {
        name
      }
    }
    aggregateCheckIn(where: $where) {
      _count {
        _all
      }
    }
  }
`;

const GET_CHECKIN_ORDER_ITEMS = `
  query CheckInOrderItems(
    $where: OrderItemWhereInput
    $orderBy: [OrderItemOrderByWithRelationInput!]
  ) {
    orderItems(where: $where, orderBy: $orderBy) {
      id
      order_id
      service_id
      price
      total
    }
  }
`;

async function postApicoreGraphql<T>(input: {
  query: string;
  variables: Record<string, unknown>;
  accessToken: string;
}): Promise<T> {
  if (!APICORE_GRAPHQL_URL) {
    throw new Error('APICORE GraphQL is not configured. Please check VITE_APICORE_GRAPHQL_URL.');
  }

  const response = await fetch(APICORE_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      query: input.query,
      variables: input.variables,
    }),
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('APICORE returned an invalid response.');
  }

  const payload = await response.json() as GraphqlEnvelope<T>;
  const graphqlError = payload.errors?.find((entry) => entry.message)?.message;

  if (!response.ok || graphqlError) {
    throw new Error(graphqlError || `APICORE request failed with status ${response.status}.`);
  }

  if (!payload.data) {
    throw new Error('APICORE did not return report data.');
  }

  return payload.data;
}

export function toApicoreBookingWallClockIso(value: Date): string {
  return new Date(Date.UTC(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
    value.getMilliseconds(),
  )).toISOString();
}

export function toMyanmarUtcIso(value: Date): string {
  const wallClockUtc = Date.UTC(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
    value.getMilliseconds(),
  );

  return new Date(wallClockUtc - MYANMAR_OFFSET_MINUTES * 60_000).toISOString();
}

export async function fetchAppointmentRecords(input: {
  clinicCode: string;
  startDate: Date;
  endDate: Date;
  status?: BookingStatus;
  accessToken: string;
}): Promise<AppointmentRecord[]> {
  const records: AppointmentRecord[] = [];
  let skip = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (skip < totalCount && records.length < MAX_REPORT_ROWS) {
    const data = await postApicoreGraphql<BookingDetailsResponse>({
      query: GET_BOOKING_DETAILS,
      accessToken: input.accessToken,
      variables: {
        clinicCode: input.clinicCode,
        startDate: toApicoreBookingWallClockIso(input.startDate),
        endDate: toApicoreBookingWallClockIso(input.endDate),
        status: input.status,
        skip,
        take: REPORT_BATCH_SIZE,
      },
    });

    const batch = data.getBookingDetails?.data ?? [];
    totalCount = data.getBookingDetails?.totalCount ?? 0;
    records.push(...batch);

    if (batch.length === 0 || batch.length < REPORT_BATCH_SIZE) {
      break;
    }

    skip += batch.length;
  }

  if (records.length >= MAX_REPORT_ROWS && records.length < totalCount) {
    throw new Error(`Appointment result exceeds the ${MAX_REPORT_ROWS.toLocaleString('en-US')} row safety limit.`);
  }

  return records;
}

export function buildCheckInOutVariables(input: {
  clinicId: string;
  startDate: Date;
  endDate: Date;
  skip: number;
  take?: number;
}) {
  return {
    where: {
      AND: [
        {
          in_time: {
            gte: toMyanmarUtcIso(input.startDate),
          },
        },
        {
          in_time: {
            lte: toMyanmarUtcIso(input.endDate),
          },
        },
        {
          clinic_id: {
            equals: input.clinicId,
          },
        },
      ],
    },
    clinicMembersWhere2: {
      clinic_id: {
        equals: input.clinicId,
      },
    },
    orderBy: [{ in_time: 'desc' }, { id: 'desc' }],
    take: input.take ?? REPORT_BATCH_SIZE,
    skip: input.skip,
  };
}

async function fetchAllCheckIns(input: {
  clinicId: string;
  startDate: Date;
  endDate: Date;
  accessToken: string;
}) {
  const records: RawCheckInRow[] = [];
  let skip = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (skip < totalCount && records.length < MAX_REPORT_ROWS) {
    const data = await postApicoreGraphql<CheckInsResponse>({
      query: GET_CHECKIN_OUT_DATA,
      accessToken: input.accessToken,
      variables: buildCheckInOutVariables({
        clinicId: input.clinicId,
        startDate: input.startDate,
        endDate: input.endDate,
        skip,
      }),
    });

    const batch = data.checkIns ?? [];
    totalCount = data.aggregateCheckIn?._count?._all ?? 0;
    records.push(...batch);

    if (batch.length === 0 || batch.length < REPORT_BATCH_SIZE) {
      break;
    }

    skip += batch.length;
  }

  if (records.length >= MAX_REPORT_ROWS && records.length < totalCount) {
    throw new Error(`Check-in/out result exceeds the ${MAX_REPORT_ROWS.toLocaleString('en-US')} row safety limit.`);
  }

  return records;
}

async function fetchOrderItems(input: {
  orderIds: string[];
  accessToken: string;
}) {
  const items: RawOrderItem[] = [];

  for (let index = 0; index < input.orderIds.length; index += ORDER_ITEM_BATCH_SIZE) {
    const orderIds = input.orderIds.slice(index, index + ORDER_ITEM_BATCH_SIZE);
    const data = await postApicoreGraphql<OrderItemsResponse>({
      query: GET_CHECKIN_ORDER_ITEMS,
      accessToken: input.accessToken,
      variables: {
        where: {
          order_id: {
            in: orderIds,
          },
          service_id: {
            not: null,
          },
        },
        orderBy: [{ updated_at: 'desc' }],
      },
    });

    items.push(...(data.orderItems ?? []));
  }

  return items;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'object' && value && 'value' in value) {
    return parseNumber((value as { value: unknown }).value);
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildOrderItemLookup(items: RawOrderItem[]) {
  const lookup = new Map<string, RawOrderItem[]>();

  items.forEach((item) => {
    if (!item.service_id) {
      return;
    }

    const key = `${item.order_id}::${item.service_id}`;
    const current = lookup.get(key) ?? [];
    current.push(item);
    lookup.set(key, current);
  });

  return lookup;
}

function findMatchedOrderItem(
  row: RawCheckInRow,
  lookup: Map<string, RawOrderItem[]>,
) {
  if (!row.order_id || !row.service?.id) {
    return null;
  }

  const matches = lookup.get(`${row.order_id}::${row.service.id}`) ?? [];
  if (row.isUsePurchaseService) {
    return matches.find((item) => parseNumber(item.price) === 0) ?? matches[0] ?? null;
  }

  return matches[0] ?? null;
}

export function mapCheckInOutRecords(
  rows: RawCheckInRow[],
  orderItems: RawOrderItem[],
): CheckInOutRecord[] {
  const itemLookup = buildOrderItemLookup(orderItems);

  return rows.map((row) => {
    const order = row.orders;
    const bookingStatus = row.booking?.status?.trim().toUpperCase() ?? null;
    const orderStatus = order?.status?.trim().toUpperCase() ?? null;
    const visitStatus = row.status?.trim().toUpperCase() || 'UNKNOWN';
    const merchantCancelled = bookingStatus === 'MERCHANT_CANCEL';
    const orderCancelled = orderStatus === 'CANCEL' || visitStatus === 'CANCEL';
    const matchedItem = findMatchedOrderItem(row, itemLookup);
    const paymentStatus = merchantCancelled
      ? MERCHANT_CANCEL_STATUS
      : orderCancelled
        ? ORDER_CANCEL_STATUS
        : order?.payment_status ?? null;

    return {
      id: row.id,
      OrderId: order?.order_id ?? null,
      CheckInTime: row.in_time ?? null,
      CheckOutTime: row.out_time ?? null,
      Servicename: row.service?.name ?? '',
      TherapicName: row.practitioner?.name ?? '',
      HelperName: row.booking?.service_helper?.name ?? row.helper?.name ?? null,
      CustomerName: row.member?.clinic_members?.[0]?.name ?? row.member?.name ?? null,
      CustomerPhoneNumber:
        row.member?.clinic_members?.[0]?.phonenumber
        ?? row.member?.phonenumber
        ?? '',
      PaymentMethod: order?.payment_method ?? null,
      PaymentStatus: paymentStatus,
      Total:
        parseNumber(matchedItem?.price)
        ?? parseNumber(matchedItem?.total)
        ?? parseNumber(row.service?.price),
      Discount: parseNumber(order?.discount) ?? 0,
      SellerName: order?.seller?.display_name ?? null,
      VisitStatus: visitStatus,
      OrderStatus: orderStatus,
      BookingStatus: bookingStatus,
    };
  });
}

export function filterCheckInOutRecords(
  records: CheckInOutRecord[],
  statusFilter: CheckInOutStatusFilter,
) {
  if (statusFilter === 'all') {
    return records;
  }

  if (statusFilter === DEFAULT_CHECK_IN_OUT_STATUS_FILTER) {
    return records.filter((record) => (
      record.OrderStatus !== 'CANCEL'
      && record.VisitStatus !== 'CANCEL'
      && record.BookingStatus !== 'MERCHANT_CANCEL'
    ));
  }

  if (statusFilter === ORDER_CANCEL_STATUS) {
    return records.filter((record) => (
      record.OrderStatus === 'CANCEL' || record.VisitStatus === 'CANCEL'
    ));
  }

  if (statusFilter === MERCHANT_CANCEL_STATUS) {
    return records.filter((record) => record.BookingStatus === 'MERCHANT_CANCEL');
  }

  return records.filter((record) => (
    record.OrderStatus !== 'CANCEL'
    && record.VisitStatus !== 'CANCEL'
    && record.BookingStatus !== 'MERCHANT_CANCEL'
    && record.PaymentStatus?.trim().toUpperCase() === statusFilter
  ));
}

export async function fetchCheckInOutRecords(input: {
  clinicId: string;
  startDate: Date;
  endDate: Date;
  accessToken: string;
}): Promise<CheckInOutRecord[]> {
  const checkIns = await fetchAllCheckIns(input);
  const orderIds = Array.from(new Set(
    checkIns
      .map((row) => row.order_id)
      .filter((orderId): orderId is string => Boolean(orderId)),
  ));
  const orderItems = orderIds.length
    ? await fetchOrderItems({
        orderIds,
        accessToken: input.accessToken,
      })
    : [];

  return mapCheckInOutRecords(checkIns, orderItems);
}
