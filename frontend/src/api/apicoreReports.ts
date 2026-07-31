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
  OriginalAmount: number | null;
  Total: number | null;
  ActualInvoice: number | null;
  Discount: number | null;
  ItemDiscount: number | null;
  SellerName: string | null;
  VisitStatus: string;
  OrderStatus: string | null;
  BookingStatus: string | null;
  Note: string | null;
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
  created_at?: string | null;
  out_time?: string | null;
  merchant_note?: string | null;
  status: string;
  isUsePurchaseService?: boolean | null;
  order_id?: string | null;
  service?: {
    id?: string | null;
    name?: string | null;
    price?: number | string | null;
  } | null;
  practitioner?: {
    id?: string | null;
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
  } | null;
  orders?: {
    order_id?: string | null;
    discount?: number | string | null;
    net_total?: number | string | null;
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
  practitioner_id?: string | null;
  quantity?: number | null;
  price?: number | string | null;
  original_price?: number | string | null;
  total?: number | string | null;
  metadata?: string | null;
  created_at?: string | null;
}

type IndexedOrderItem = RawOrderItem & {
  __inputIndex: number;
};

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
      created_at
      out_time
      merchant_note
      status
      isUsePurchaseService
      order_id
      service {
        id
        name
        price
      }
      practitioner {
        id
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
      }
      orders {
        order_id
        discount
        net_total
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
      practitioner_id
      quantity
      price
      original_price
      total
      metadata
      created_at
    }
  }
`;

export async function postApicoreGraphql<T>(input: {
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
    // Keep the same ordering contract as gt.report. In particular, do not add
    // an id-desc tie breaker: it reverses service rows that share a check-in
    // timestamp compared with the operational report.
    orderBy: [{ in_time: 'desc' }],
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
      variables: buildCheckInOrderItemVariables(orderIds),
    });

    items.push(...(data.orderItems ?? []));
  }

  return items;
}

export function buildCheckInOrderItemVariables(orderIds: string[]) {
  return {
    where: {
      order_id: {
        in: orderIds,
      },
      service_id: {
        not: null,
      },
    },
    // gt.report resolves duplicate service lines from the newest-created
    // matching item. updated_at can change later and select a different item.
    orderBy: [{ created_at: 'desc' }],
  };
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

function timestampValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildOrderItemLookup(items: RawOrderItem[]) {
  const lookup = new Map<string, IndexedOrderItem[]>();

  items.forEach((item, index) => {
    if (!item.service_id) {
      return;
    }

    const key = `${item.order_id}::${item.service_id}`;
    const current = lookup.get(key) ?? [];
    current.push({ ...item, __inputIndex: index });
    lookup.set(key, current);
  });

  lookup.forEach((matches) => {
    matches.sort((left, right) => {
      const leftTimestamp = timestampValue(left.created_at);
      const rightTimestamp = timestampValue(right.created_at);

      if (leftTimestamp !== null && rightTimestamp !== null && leftTimestamp !== rightTimestamp) {
        return rightTimestamp - leftTimestamp;
      }

      return left.__inputIndex - right.__inputIndex;
    });
  });

  return lookup;
}

function matchOrderItemsToCheckIns(
  rows: RawCheckInRow[],
  orderItems: RawOrderItem[],
) {
  const itemLookup = buildOrderItemLookup(orderItems);
  const assignments = new Map<string, RawOrderItem>();
  const orderedRows = rows
    .map((row, inputIndex) => ({ row, inputIndex }))
    .filter(({ row }) => (
      row.status?.trim().toUpperCase() === 'CHECKOUT'
      && Boolean(row.order_id)
      && Boolean(row.service?.id)
    ))
    .sort((left, right) => {
      const leftTimestamp = timestampValue(left.row.created_at);
      const rightTimestamp = timestampValue(right.row.created_at);

      if (leftTimestamp !== null && rightTimestamp !== null && leftTimestamp !== rightTimestamp) {
        return rightTimestamp - leftTimestamp;
      }

      return left.inputIndex - right.inputIndex;
    });

  orderedRows.forEach(({ row }) => {
    const key = `${row.order_id}::${row.service?.id}`;
    const matches = itemLookup.get(key) ?? [];
    const isPurchasedService = Boolean(row.isUsePurchaseService);
    const matchesPurchaseType = (item: RawOrderItem) => (
      isPurchasedService
        ? parseNumber(item.total) === 0
        : parseNumber(item.total) !== 0
    );
    const practitionerId = row.practitioner?.id;
    let matchIndex = practitionerId
      ? matches.findIndex((item) => (
          item.practitioner_id === practitionerId
          && matchesPurchaseType(item)
        ))
      : -1;

    if (matchIndex === -1) {
      matchIndex = matches.findIndex(matchesPurchaseType);
    }

    // A zero-total line can also be a genuine 100% discount rather than a
    // purchased service. If there is no non-zero candidate, use the remaining
    // service item exactly once.
    if (matchIndex === -1 && !isPurchasedService) {
      matchIndex = practitionerId
        ? matches.findIndex((item) => item.practitioner_id === practitionerId)
        : -1;
      if (matchIndex === -1 && matches.length > 0) {
        matchIndex = 0;
      }
    }

    if (matchIndex === -1) {
      return;
    }

    const [matchedItem] = matches.splice(matchIndex, 1);
    assignments.set(row.id, matchedItem);
  });

  return assignments;
}

function parseItemMetadata(metadata: string | null | undefined) {
  if (!metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object'
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function getOrderItemDiscount(
  row: RawCheckInRow,
  item: RawOrderItem | undefined,
) {
  if (!item || row.isUsePurchaseService) {
    return null;
  }

  // APICORE stores a real line discount in order-item metadata. Differences
  // between original_price, sold price, and total can also be manual price
  // changes, so inferring a discount from those fields creates false values.
  const discount = parseNumber(parseItemMetadata(item.metadata).discount) ?? 0;

  return discount > 0 ? discount : 0;
}

function getOrderItemOriginalAmount(item: RawOrderItem | undefined) {
  if (!item) {
    return null;
  }

  const price = parseNumber(item.price);
  if (price === null) {
    return null;
  }

  const quantity = parseNumber(item.quantity) ?? 1;
  return price * quantity;
}

export function mapCheckInOutRecords(
  rows: RawCheckInRow[],
  orderItems: RawOrderItem[],
): CheckInOutRecord[] {
  const matchedItems = matchOrderItemsToCheckIns(rows, orderItems);

  return rows.map((row) => {
    const order = row.orders;
    const bookingStatus = row.booking?.status?.trim().toUpperCase() ?? null;
    const orderStatus = order?.status?.trim().toUpperCase() ?? null;
    const visitStatus = row.status?.trim().toUpperCase() || 'UNKNOWN';
    const merchantCancelled = bookingStatus === 'MERCHANT_CANCEL';
    const orderCancelled = orderStatus === 'CANCEL' || visitStatus === 'CANCEL';
    const matchedItem = matchedItems.get(row.id);
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
      // A sale checkout can attach every service line to one shared booking.
      // That booking stores the first service's helper, while the check-in row
      // stores the helper actually assigned to this individual service.
      HelperName: row.helper?.name ?? null,
      CustomerName: row.member?.clinic_members?.[0]?.name ?? row.member?.name ?? null,
      CustomerPhoneNumber:
        row.member?.clinic_members?.[0]?.phonenumber
        ?? row.member?.phonenumber
        ?? '',
      PaymentMethod: order?.payment_method ?? null,
      PaymentStatus: paymentStatus,
      // "Original Amount" follows the invoice line's price before its explicit
      // item discount. Catalog original_price can differ after a manual sale
      // price change and must not be used here.
      OriginalAmount: getOrderItemOriginalAmount(matchedItem),
      // Match the operational item amount: this is the line total after any
      // explicit item discount or price adjustment has been applied.
      Total: parseNumber(matchedItem?.total),
      ActualInvoice: order ? parseNumber(order.net_total) : null,
      Discount: order ? parseNumber(order.discount) ?? 0 : null,
      ItemDiscount: getOrderItemDiscount(row, matchedItem),
      SellerName: order?.seller?.display_name ?? null,
      VisitStatus: visitStatus,
      OrderStatus: orderStatus,
      BookingStatus: bookingStatus,
      Note: row.merchant_note?.trim() || null,
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
      .filter((row) => row.status?.trim().toUpperCase() === 'CHECKOUT')
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
