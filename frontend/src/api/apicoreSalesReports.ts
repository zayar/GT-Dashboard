import {
  postApicoreGraphql,
  toMyanmarUtcIso,
} from './apicoreReports';

const REPORT_BATCH_SIZE = 300;
const MAX_REPORT_ORDERS = 50_000;
const MYANMAR_TIME_ZONE = 'Asia/Yangon';

export interface SalesDetailRecord {
  Date: string;
  InvoiceNumber: string;
  CustomerName: string;
  MemberId: string;
  SalePerson: string;
  ServiceName: string | null;
  ServicePackageName: string | null;
  WalletTopUp: string | number | null;
  PaymentStatus: string;
  PaymentMethod: string;
  PaymentType: string | null;
  PaymentAmount: number | null;
  Note: string | null;
  PaymentNote: string | null;
  InvoiceNetTotal: number;
  ItemQuantity: number | null;
  ItemPrice: number | null;
  ItemTotal: number | null;
  SubTotal: number | null;
  Total: number | null;
  NetTotal: number | null;
  OrderBalance: number | null;
  OrderCreditBalance: number | null;
  Discount: number | null;
  Tax: number | null;
}

export interface PaymentReportRecord {
  Date: string;
  InvoiceNumber: string;
  CustomerName: string;
  MemberId: string;
  SalePerson: string;
  ServiceName: string;
  ServicePackageName: string;
  PaymentMethod: string;
  PaymentStatus: string;
  WalletTopUp: string | number;
  PaymentAmount: number;
}

interface RawOrderPayment {
  id: string;
  payment_amount: number | string;
  payment_method?: string | null;
  payment_note?: string | null;
  payment_date: string;
}

interface RawOrderItem {
  id: string;
  quantity: number;
  tax?: number | string | null;
  price?: number | string | null;
  original_price?: number | string | null;
  total?: number | string | null;
  metadata?: string | null;
  service?: {
    name?: string | null;
  } | null;
  service_package?: {
    name?: string | null;
  } | null;
  product_stock_item?: {
    name?: string | null;
  } | null;
}

interface RawReportOrder {
  id: string;
  order_id: string;
  member_id: string;
  created_at: string;
  status?: string | null;
  total?: number | string | null;
  net_total?: number | string | null;
  discount?: number | string | null;
  tax?: number | string | null;
  balance?: number | string | null;
  credit_balance?: number | string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  metadata?: string | null;
  member?: {
    name?: string | null;
    member_id?: string | null;
    clinic_members?: Array<{
      name?: string | null;
      member_id?: string | null;
    }> | null;
  } | null;
  user?: {
    name?: string | null;
  } | null;
  seller?: {
    display_name?: string | null;
  } | null;
  payments?: RawOrderPayment[] | null;
  order_items?: RawOrderItem[] | null;
}

interface OrdersResponse {
  orders?: RawReportOrder[];
  aggregateOrder?: {
    _count?: {
      id?: number | null;
    } | null;
  } | null;
}

interface ReportDateInput {
  filterType: 'day' | 'month';
  startDate: Date | null;
  endDate: Date | null;
  selectedDate: Date | null;
}

const GET_SALES_PAYMENT_ORDERS = `
  query SalesPaymentOrders(
    $where: OrderWhereInput
    $orderBy: [OrderOrderByWithRelationInput!]
    $take: Int
    $skip: Int
    $clinicMembersWhere2: ClinicMemberWhereInput
  ) {
    orders(where: $where, orderBy: $orderBy, take: $take, skip: $skip) {
      id
      order_id
      member_id
      created_at
      status
      total
      net_total
      discount
      tax
      balance
      credit_balance
      payment_method
      payment_status
      metadata
      member {
        name
        member_id
        clinic_members(where: $clinicMembersWhere2) {
          name
          member_id
        }
      }
      user {
        name
      }
      seller {
        display_name
      }
      payments {
        id
        payment_amount
        payment_method
        payment_note
        payment_date
      }
      order_items {
        id
        quantity
        tax
        price
        original_price
        total
        metadata
        service {
          name
        }
        service_package {
          name
        }
        product_stock_item {
          name
        }
      }
    }
    aggregateOrder(where: $where) {
      _count {
        id
      }
    }
  }
`;

function startOfDay(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    0,
    0,
    0,
    0,
  );
}

function endOfDay(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    23,
    59,
    59,
    999,
  );
}

export function resolveReportDateRange(input: ReportDateInput) {
  if (input.filterType === 'month') {
    if (!input.selectedDate) {
      throw new Error('Please select a report month.');
    }

    return {
      startDate: new Date(
        input.selectedDate.getFullYear(),
        input.selectedDate.getMonth(),
        1,
        0,
        0,
        0,
        0,
      ),
      endDate: new Date(
        input.selectedDate.getFullYear(),
        input.selectedDate.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    };
  }

  if (!input.startDate || !input.endDate) {
    throw new Error('Please select a report date range.');
  }

  return {
    startDate: startOfDay(input.startDate),
    endDate: endOfDay(input.endDate),
  };
}

export function buildSalesOrderWhere(input: {
  clinicId: string;
  startDate: Date;
  endDate: Date;
}) {
  return {
    clinic_id: {
      equals: input.clinicId,
    },
    status: {
      not: 'CANCEL',
    },
    created_at: {
      gte: toMyanmarUtcIso(input.startDate),
      lte: toMyanmarUtcIso(input.endDate),
    },
  };
}

export function buildPaymentOrderWhere(input: {
  clinicId: string;
  startDate: Date;
  endDate: Date;
}) {
  return {
    clinic_id: {
      equals: input.clinicId,
    },
    status: {
      equals: 'ACTIVE',
    },
    payments: {
      some: {
        payment_date: {
          gte: toMyanmarUtcIso(input.startDate),
          lte: toMyanmarUtcIso(input.endDate),
        },
      },
    },
  };
}

async function fetchAllOrders(input: {
  clinicId: string;
  where: Record<string, unknown>;
  accessToken: string;
}) {
  const orders: RawReportOrder[] = [];
  let skip = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (skip < totalCount && orders.length < MAX_REPORT_ORDERS) {
    const data = await postApicoreGraphql<OrdersResponse>({
      query: GET_SALES_PAYMENT_ORDERS,
      accessToken: input.accessToken,
      variables: {
        where: input.where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: REPORT_BATCH_SIZE,
        skip,
        clinicMembersWhere2: {
          clinic_id: {
            equals: input.clinicId,
          },
        },
      },
    });

    const batch = data.orders ?? [];
    totalCount = data.aggregateOrder?._count?.id ?? 0;
    orders.push(...batch);

    if (batch.length === 0 || batch.length < REPORT_BATCH_SIZE) {
      break;
    }

    skip += batch.length;
  }

  if (orders.length >= MAX_REPORT_ORDERS && orders.length < totalCount) {
    throw new Error(`Report exceeds the ${MAX_REPORT_ORDERS.toLocaleString('en-US')} order safety limit.`);
  }

  return orders;
}

function parseNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'object' && 'value' in (value as object)) {
    return parseNumber((value as { value: unknown }).value, fallback);
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMyanmarDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MYANMAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((entry) => entry.type === type)?.value ?? ''
  );

  return `${part('year')}-${part('month')}-${part('day')}`;
}

function normalizedMethod(value: string | null | undefined) {
  return value?.trim().toUpperCase() || 'UNSPECIFIED';
}

function isReportableMethod(value: string | null | undefined) {
  return normalizedMethod(value) !== 'PASS';
}

function customerName(order: RawReportOrder) {
  return order.member?.clinic_members?.[0]?.name?.trim()
    || order.member?.name?.trim()
    || '';
}

function memberId(order: RawReportOrder) {
  return order.member?.clinic_members?.[0]?.member_id?.trim()
    || order.member?.member_id?.trim()
    || order.member_id
    || '';
}

function sellerName(order: RawReportOrder) {
  return order.seller?.display_name?.trim()
    || order.user?.name?.trim()
    || '';
}

function walletTopUp(order: RawReportOrder) {
  return order.order_id?.toUpperCase().startsWith('TO-') ? 'Topup' : '';
}

function parseMetadata(metadata: string | null | undefined) {
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

function orderMerchantNote(order: RawReportOrder) {
  const merchantNote = parseMetadata(order.metadata).merchant_note;

  return typeof merchantNote === 'string'
    ? merchantNote.trim() || null
    : null;
}

function itemName(item: RawOrderItem) {
  if (item.service?.name) {
    return item.service.name;
  }
  if (item.product_stock_item?.name) {
    return item.product_stock_item.name;
  }

  if (item.metadata) {
    const metadataName = parseMetadata(item.metadata).name;
    if (typeof metadataName === 'string') {
      return metadataName;
    }
  }

  return null;
}

function reportablePayments(order: RawReportOrder) {
  const seen = new Set<string>();

  return (order.payments ?? []).filter((payment) => {
    if (!(parseNumber(payment.payment_amount) > 0) || !isReportableMethod(payment.payment_method)) {
      return false;
    }

    const key = payment.id || [
      payment.payment_method,
      payment.payment_amount,
      payment.payment_date,
      payment.payment_note,
    ].join('|');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function mapSalesDetailRecords(orders: RawReportOrder[]): SalesDetailRecord[] {
  return orders
    .filter((order) => order.status !== 'CANCEL' && isReportableMethod(order.payment_method))
    .flatMap((order) => {
      const items = order.order_items ?? [];
      const payments = reportablePayments(order);
      const rowCount = Math.max(items.length, payments.length, 1);
      const duplicateCounts = new Map<string, number>();

      return Array.from({ length: rowCount }, (_, index) => {
        const item = items[index] ?? null;
        const payment = payments[index] ?? null;
        const baseName = item ? itemName(item) : null;
        const occurrence = baseName
          ? (duplicateCounts.get(baseName) ?? 0) + 1
          : 0;
        if (baseName) {
          duplicateCounts.set(baseName, occurrence);
        }

        const serviceName = baseName && occurrence > 1
          ? `${baseName} #${occurrence}`
          : baseName;
        const method = normalizedMethod(payment?.payment_method ?? order.payment_method);

        return {
          Date: formatMyanmarDate(order.created_at),
          InvoiceNumber: order.order_id ?? '',
          CustomerName: customerName(order),
          MemberId: memberId(order),
          SalePerson: sellerName(order),
          ServiceName: serviceName,
          ServicePackageName: item?.service_package?.name ?? null,
          WalletTopUp: walletTopUp(order),
          PaymentStatus: order.payment_status ?? '',
          PaymentMethod: method,
          PaymentType: method,
          PaymentAmount: payment ? parseNumber(payment.payment_amount) : null,
          Note: orderMerchantNote(order),
          PaymentNote: payment?.payment_note ?? null,
          InvoiceNetTotal: parseNumber(order.net_total),
          ItemQuantity: item?.quantity ?? null,
          ItemPrice: item ? parseNumber(item.price) : null,
          ItemTotal: item ? parseNumber(item.total) : null,
          SubTotal: parseNumber(order.total),
          Total: parseNumber(order.total),
          NetTotal: parseNumber(order.net_total),
          OrderBalance: parseNumber(order.balance),
          OrderCreditBalance: parseNumber(order.credit_balance),
          Discount: parseNumber(order.discount),
          Tax: parseNumber(order.tax),
        };
      });
    });
}

export function mapPaymentReportRecords(
  orders: RawReportOrder[],
  startDate: Date,
  endDate: Date,
): PaymentReportRecord[] {
  const rangeStart = new Date(toMyanmarUtcIso(startDate)).getTime();
  const rangeEnd = new Date(toMyanmarUtcIso(endDate)).getTime();

  return orders.flatMap((order) => {
    if (order.status === 'CANCEL') {
      return [];
    }

    const serviceNames = Array.from(new Set(
      (order.order_items ?? [])
        .map(itemName)
        .filter((name): name is string => Boolean(name)),
    )).join(' · ');
    const packageNames = Array.from(new Set(
      (order.order_items ?? [])
        .map((item) => item.service_package?.name)
        .filter((name): name is string => Boolean(name)),
    )).join(' · ');

    return reportablePayments(order)
      .filter((payment) => {
        const paymentTime = new Date(payment.payment_date).getTime();
        return !Number.isNaN(paymentTime)
          && paymentTime >= rangeStart
          && paymentTime <= rangeEnd;
      })
      .map((payment) => ({
        Date: formatMyanmarDate(payment.payment_date),
        InvoiceNumber: order.order_id ?? '',
        CustomerName: customerName(order),
        MemberId: memberId(order),
        SalePerson: sellerName(order),
        ServiceName: serviceNames,
        ServicePackageName: packageNames,
        PaymentMethod: normalizedMethod(payment.payment_method),
        PaymentStatus: order.payment_status ?? '',
        WalletTopUp: walletTopUp(order),
        PaymentAmount: parseNumber(payment.payment_amount),
      }));
  }).sort((left, right) => (
    right.Date.localeCompare(left.Date)
    || right.InvoiceNumber.localeCompare(left.InvoiceNumber)
  ));
}

export async function fetchSalesDetailRecords(input: ReportDateInput & {
  clinicId: string;
  accessToken: string;
}) {
  const range = resolveReportDateRange(input);
  const orders = await fetchAllOrders({
    clinicId: input.clinicId,
    accessToken: input.accessToken,
    where: buildSalesOrderWhere({
      clinicId: input.clinicId,
      ...range,
    }),
  });

  return mapSalesDetailRecords(orders);
}

export async function fetchPaymentReportRecords(input: ReportDateInput & {
  clinicId: string;
  accessToken: string;
}) {
  const range = resolveReportDateRange(input);
  const orders = await fetchAllOrders({
    clinicId: input.clinicId,
    accessToken: input.accessToken,
    where: buildPaymentOrderWhere({
      clinicId: input.clinicId,
      ...range,
    }),
  });

  return mapPaymentReportRecords(orders, range.startDate, range.endDate);
}
