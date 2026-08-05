import { describe, expect, it } from 'vitest';
import {
  buildCheckInOrderItemVariables,
  buildCheckInOutVariables,
  filterCheckInOutRecords,
  mapCheckInOutRecords,
  toApicoreBookingWallClockIso,
  toMyanmarUtcIso,
  type CheckInOutRecord,
} from './apicoreReports';
import {
  DEFAULT_CHECK_IN_OUT_STATUS_FILTER,
  MERCHANT_CANCEL_STATUS,
  ORDER_CANCEL_STATUS,
} from '../utils/checkInOutReport';

describe('APICORE report date boundaries', () => {
  it('sends appointment resolver boundaries as wall-clock values', () => {
    expect(toApicoreBookingWallClockIso(new Date(2026, 6, 24, 0, 0, 0, 0))).toBe(
      '2026-07-24T00:00:00.000Z',
    );
  });

  it('converts Myanmar check-in boundaries to UTC instants', () => {
    expect(toMyanmarUtcIso(new Date(2026, 6, 24, 0, 0, 0, 0))).toBe(
      '2026-07-23T17:30:00.000Z',
    );
    expect(toMyanmarUtcIso(new Date(2026, 6, 24, 23, 59, 59, 999))).toBe(
      '2026-07-24T17:29:59.999Z',
    );
  });

  it('builds a clinic-scoped, stable check-in query', () => {
    const variables = buildCheckInOutVariables({
      clinicId: 'clinic-1',
      startDate: new Date(2026, 6, 24, 0, 0, 0, 0),
      endDate: new Date(2026, 6, 24, 23, 59, 59, 999),
      skip: 500,
    });

    expect(variables.where.AND).toContainEqual({
      clinic_id: { equals: 'clinic-1' },
    });
    expect(variables.orderBy).toEqual([{ in_time: 'desc' }]);
    expect(variables.skip).toBe(500);
    expect(variables.take).toBe(500);
  });

  it('matches the reference order-item ordering', () => {
    expect(buildCheckInOrderItemVariables(['order-1', 'order-2'])).toEqual({
      where: {
        order_id: { in: ['order-1', 'order-2'] },
        service_id: { not: null },
      },
      orderBy: [{ created_at: 'desc' }],
    });
  });
});

describe('live check-in/out mapping', () => {
  it('maps APICORE relations and the matching order item into the report row', () => {
    const rows = mapCheckInOutRecords(
      [
        {
          id: 'checkin-1',
          in_time: '2026-07-24T03:30:00.000Z',
          out_time: '2026-07-24T04:30:00.000Z',
          merchant_note: 'Follow-up note',
          status: 'CHECKOUT',
          order_id: 'order-internal-1',
          service: { id: 'service-1', name: 'Laser', price: '45000' },
          practitioner: { name: 'Dr A' },
          member: {
            name: 'Global Name',
            phonenumber: '+959000000',
            clinic_members: [{ name: 'Clinic Name', phonenumber: '+959111111' }],
          },
          booking: {
            status: 'CHECKOUT',
          },
          helper: { name: 'Helper A' },
          orders: {
            order_id: 'INV-001',
            discount: '5000',
            net_total: '35000',
            payment_method: 'KPAY',
            payment_status: 'PAID',
            status: 'ACTIVE',
            seller: { display_name: 'Seller A' },
          },
        },
      ],
      [
        {
          id: 'item-1',
          order_id: 'order-internal-1',
          service_id: 'service-1',
          price: '40000',
          total: '40000',
        },
      ],
    );

    expect(rows[0]).toMatchObject({
      id: 'checkin-1',
      OrderId: 'INV-001',
      Servicename: 'Laser',
      TherapicName: 'Dr A',
      HelperName: 'Helper A',
      CustomerName: 'Clinic Name',
      CustomerPhoneNumber: '+959111111',
      PaymentMethod: 'KPAY',
      PaymentStatus: 'PAID',
      OriginalAmount: 40000,
      Total: 40000,
      ActualInvoice: 35000,
      Discount: 5000,
      ItemDiscount: 0,
      SellerName: 'Seller A',
      Note: 'Follow-up note',
    });
  });

  it('falls back to the order merchant note used by the legacy Sales report', () => {
    const rows = mapCheckInOutRecords(
      [
        {
          id: 'checkin-so-790354-1',
          in_time: '2026-07-25T12:37:00.000Z',
          merchant_note: '',
          status: 'CHECKOUT',
          order_id: 'order-so-790354',
          service: { id: 'service-1', name: 'Cleasing Mask + Tonic Shampoo' },
          orders: {
            order_id: 'SO-790354',
            metadata: '{"merchant_note":" Birthday Gift Voucher "}',
          },
        },
        {
          id: 'checkin-so-790354-2',
          in_time: '2026-07-25T12:37:00.000Z',
          merchant_note: null,
          status: 'CHECKOUT',
          order_id: 'order-so-790354',
          service: { id: 'service-2', name: 'Color Lock' },
          orders: {
            order_id: 'SO-790354',
            metadata: '{"merchant_note":" Birthday Gift Voucher "}',
          },
        },
      ],
      [],
    );

    expect(rows.map((row) => row.Note)).toEqual([
      'Birthday Gift Voucher',
      'Birthday Gift Voucher',
    ]);
  });

  it('keeps a service-specific check-in note ahead of the order note', () => {
    const [record] = mapCheckInOutRecords(
      [
        {
          id: 'checkin-service-note',
          in_time: '2026-07-25T12:37:00.000Z',
          merchant_note: 'Nan Baby Myint',
          status: 'CHECKIN',
          orders: {
            order_id: 'SO-123456',
            metadata: '{"merchant_note":"General order note"}',
          },
        },
      ],
      [],
    );

    expect(record.Note).toBe('Nan Baby Myint');
  });

  it('ignores malformed or non-text order merchant notes', () => {
    const rows = mapCheckInOutRecords(
      [
        {
          id: 'malformed-order-metadata',
          in_time: '2026-07-25T12:37:00.000Z',
          status: 'CHECKIN',
          orders: { metadata: '{not-json' },
        },
        {
          id: 'non-text-order-note',
          in_time: '2026-07-25T12:37:00.000Z',
          status: 'CHECKIN',
          orders: { metadata: '{"merchant_note":123}' },
        },
      ],
      [],
    );

    expect(rows.map((row) => row.Note)).toEqual([null, null]);
  });

  it('labels merchant and order cancellations from their source relations', () => {
    const rows = mapCheckInOutRecords(
      [
        {
          id: 'merchant-cancel',
          in_time: '2026-07-24T03:30:00.000Z',
          status: 'CHECKIN',
          booking: { status: 'MERCHANT_CANCEL' },
        },
        {
          id: 'order-cancel',
          in_time: '2026-07-24T03:30:00.000Z',
          status: 'CANCEL',
          orders: { status: 'CANCEL' },
        },
      ],
      [],
    );

    expect(rows[0].PaymentStatus).toBe(MERCHANT_CANCEL_STATUS);
    expect(rows[1].PaymentStatus).toBe(ORDER_CANCEL_STATUS);
  });

  it('uses each service check-in helper instead of repeating a shared booking helper', () => {
    const rows = mapCheckInOutRecords(
      [
        {
          id: 'scalp-nwet',
          in_time: '2026-07-26T10:44:00.000Z',
          status: 'CHECKOUT',
          order_id: 'order-so-166837',
          service: { id: 'scalp-service', name: 'Scalp Shampoo & Browdry' },
          booking: { status: 'CHECKOUT' },
          helper: { name: 'Nwet Nwet' },
        },
        {
          id: 'scalp-may',
          in_time: '2026-07-26T10:44:00.000Z',
          status: 'CHECKOUT',
          order_id: 'order-so-166837',
          service: { id: 'scalp-service', name: 'Scalp Shampoo & Browdry' },
          booking: { status: 'CHECKOUT' },
          helper: { name: 'May Phoo' },
        },
        {
          id: 'haircut-no-helper',
          in_time: '2026-07-26T10:44:00.000Z',
          status: 'CHECKOUT',
          order_id: 'order-so-166837',
          service: { id: 'haircut-service', name: 'Hair cut (Lady)' },
          booking: { status: 'CHECKOUT' },
          helper: null,
        },
      ],
      [],
    );

    expect(rows.map((row) => row.HelperName)).toEqual([
      'Nwet Nwet',
      'May Phoo',
      null,
    ]);
  });

  it('leaves service amount blank unless a checkout row matches an order item', () => {
    const rows = mapCheckInOutRecords(
      [
        {
          id: 'still-checked-in',
          in_time: '2026-07-24T03:30:00.000Z',
          status: 'CHECKIN',
          order_id: 'order-1',
          service: { id: 'service-1', name: 'Laser', price: '45000' },
        },
        {
          id: 'missing-item',
          in_time: '2026-07-24T03:30:00.000Z',
          status: 'CHECKOUT',
          order_id: 'order-2',
          service: { id: 'service-2', name: 'Facial', price: '30000' },
        },
      ],
      [
        {
          id: 'item-1',
          order_id: 'order-1',
          service_id: 'service-1',
          price: '40000',
        },
      ],
    );

    expect(rows.map((row) => row.Total)).toEqual([null, null]);
  });

  it('requires the zero-price order item for a purchased service', () => {
    const [record] = mapCheckInOutRecords(
      [
        {
          id: 'purchased-service',
          in_time: '2026-07-24T03:30:00.000Z',
          status: 'CHECKOUT',
          isUsePurchaseService: true,
          order_id: 'order-1',
          service: { id: 'service-1', name: 'Laser', price: '45000' },
        },
      ],
      [
        {
          id: 'paid-item',
          order_id: 'order-1',
          service_id: 'service-1',
          price: '40000',
        },
      ],
    );

    expect(record.Total).toBeNull();
  });

  it('consumes duplicate service items once and keeps post-discount service amounts', () => {
    const rows = mapCheckInOutRecords(
      [
        {
          id: 'checkin-mee',
          in_time: '2026-07-24T03:30:00.000Z',
          created_at: '2026-07-24T03:30:00.000Z',
          status: 'CHECKOUT',
          order_id: 'order-1',
          service: { id: 'service-1', name: 'Lazulite Shampoo & Blowdry' },
          practitioner: { id: 'therapist-mee', name: 'Tr.Mee' },
        },
        {
          id: 'checkin-nilar',
          in_time: '2026-07-24T03:30:00.000Z',
          created_at: '2026-07-24T03:31:00.000Z',
          status: 'CHECKOUT',
          order_id: 'order-1',
          service: { id: 'service-1', name: 'Lazulite Shampoo & Blowdry' },
          practitioner: { id: 'therapist-nilar', name: 'Tr.Nilar' },
        },
      ],
      [
        {
          id: 'newest-item',
          order_id: 'order-1',
          service_id: 'service-1',
          practitioner_id: 'therapist-nilar',
          quantity: 1,
          price: '30000',
          original_price: '30000',
          total: '25000',
          metadata: '{"discount":5000}',
          created_at: '2026-07-24T03:31:00.000Z',
        },
        {
          id: 'older-item',
          order_id: 'order-1',
          service_id: 'service-1',
          practitioner_id: 'therapist-mee',
          quantity: 1,
          price: '30000',
          original_price: '30000',
          total: '30000',
          created_at: '2026-07-24T03:30:00.000Z',
        },
      ],
    );

    expect(rows.map((row) => row.Total)).toEqual([30000, 25000]);
    expect(rows.map((row) => row.ItemDiscount)).toEqual([0, 5000]);
  });

  it('reports 50% item discounts and post-discount service amounts per line', () => {
    const rows = mapCheckInOutRecords(
      [
        {
          id: 'foot-scrub',
          in_time: '2026-07-24T03:30:00.000Z',
          status: 'CHECKOUT',
          order_id: 'order-259083',
          service: { id: 'foot-scrub-service', name: 'Foot Scrub' },
        },
        {
          id: 'nail-color',
          in_time: '2026-07-24T03:30:00.000Z',
          status: 'CHECKOUT',
          order_id: 'order-259083',
          service: { id: 'nail-color-service', name: 'Nail Color' },
        },
      ],
      [
        {
          id: 'foot-scrub-item',
          order_id: 'order-259083',
          service_id: 'foot-scrub-service',
          quantity: 1,
          price: '10000',
          original_price: '10000',
          total: '5000',
          metadata: '{"discount":5000}',
        },
        {
          id: 'nail-color-item',
          order_id: 'order-259083',
          service_id: 'nail-color-service',
          quantity: 1,
          price: '10000',
          original_price: '10000',
          total: '5000',
          metadata: '{"discount":5000}',
        },
      ],
    );

    expect(rows.map((row) => row.ItemDiscount)).toEqual([5000, 5000]);
    expect(rows.map((row) => row.Total)).toEqual([5000, 5000]);
  });

  it('matches the verified discount behavior for SO-858172 and SO-699421', () => {
    const rows = mapCheckInOutRecords(
      [
        {
          id: 'checkin-so-858172',
          in_time: '2026-07-28T03:30:00.000Z',
          status: 'CHECKOUT',
          order_id: 'internal-so-858172',
          service: { id: 'service-lazulite', name: 'Lazulite Shampoo & Blowdry' },
          orders: {
            order_id: 'SO-858172',
            net_total: '24000',
          },
        },
        {
          id: 'checkin-so-699421',
          in_time: '2026-07-28T03:30:00.000Z',
          status: 'CHECKOUT',
          order_id: 'internal-so-699421',
          service: { id: 'service-eyelash', name: 'Eyelash Refill' },
          orders: {
            order_id: 'SO-699421',
            net_total: '45000',
          },
        },
      ],
      [
        {
          id: 'item-so-858172',
          order_id: 'internal-so-858172',
          service_id: 'service-lazulite',
          quantity: 1,
          price: '30000',
          original_price: '30000',
          total: '24000',
          metadata: '{"discount":"6000"}',
        },
        {
          id: 'item-so-699421',
          order_id: 'internal-so-699421',
          service_id: 'service-eyelash',
          quantity: 1,
          price: '45000',
          original_price: '50000',
          total: '45000',
          metadata: null,
        },
      ],
    );

    expect(rows).toEqual([
      expect.objectContaining({
        OrderId: 'SO-858172',
        OriginalAmount: 30000,
        Total: 24000,
        ItemDiscount: 6000,
        ActualInvoice: 24000,
      }),
      expect.objectContaining({
        OrderId: 'SO-699421',
        OriginalAmount: 45000,
        Total: 45000,
        ItemDiscount: 0,
        ActualInvoice: 45000,
      }),
    ]);
  });

  it('keeps the verified post-discount service amounts for SO-259093', () => {
    const rows = mapCheckInOutRecords(
      [
        {
          id: 'checkin-nail-color',
          in_time: '2026-07-25T08:17:00.000Z',
          status: 'CHECKOUT',
          order_id: 'internal-so-259093',
          service: { id: 'service-nail-color', name: 'Nail Color' },
          orders: { order_id: 'SO-259093', net_total: '25000' },
        },
        {
          id: 'checkin-foot-scrub',
          in_time: '2026-07-25T08:17:00.000Z',
          status: 'CHECKOUT',
          order_id: 'internal-so-259093',
          service: { id: 'service-foot-scrub', name: 'Foot Scrub' },
          orders: { order_id: 'SO-259093', net_total: '25000' },
        },
        {
          id: 'checkin-lazulite',
          in_time: '2026-07-25T08:17:00.000Z',
          status: 'CHECKOUT',
          order_id: 'internal-so-259093',
          service: { id: 'service-lazulite', name: 'Lazulite Shampoo & Blowdry' },
          orders: { order_id: 'SO-259093', net_total: '25000' },
        },
      ],
      [
        {
          id: 'item-nail-color',
          order_id: 'internal-so-259093',
          service_id: 'service-nail-color',
          quantity: 1,
          price: '10000',
          total: '5000',
          metadata: '{"discount":"5000"}',
        },
        {
          id: 'item-foot-scrub',
          order_id: 'internal-so-259093',
          service_id: 'service-foot-scrub',
          quantity: 1,
          price: '10000',
          total: '5000',
          metadata: '{"discount":"5000"}',
        },
        {
          id: 'item-lazulite',
          order_id: 'internal-so-259093',
          service_id: 'service-lazulite',
          quantity: 1,
          price: '30000',
          total: '15000',
          metadata: '{"discount":"15000"}',
        },
      ],
    );

    expect(rows.map((row) => ({
      OriginalAmount: row.OriginalAmount,
      ServiceAmount: row.Total,
      ItemDiscount: row.ItemDiscount,
      ActualInvoice: row.ActualInvoice,
    }))).toEqual([
      { OriginalAmount: 10000, ServiceAmount: 5000, ItemDiscount: 5000, ActualInvoice: 25000 },
      { OriginalAmount: 10000, ServiceAmount: 5000, ItemDiscount: 5000, ActualInvoice: 25000 },
      { OriginalAmount: 30000, ServiceAmount: 15000, ItemDiscount: 15000, ActualInvoice: 25000 },
    ]);
  });
});

describe('check-in/out status filters', () => {
  const baseRecord: CheckInOutRecord = {
    id: 'base',
    OrderId: 'INV-1',
    CheckInTime: null,
    CheckOutTime: null,
    Servicename: '',
    TherapicName: '',
    HelperName: null,
    CustomerName: null,
    CustomerPhoneNumber: '',
    PaymentMethod: null,
    PaymentStatus: 'PAID',
    OriginalAmount: null,
    Total: null,
    ActualInvoice: null,
    Discount: null,
    ItemDiscount: null,
    SellerName: null,
    VisitStatus: 'CHECKOUT',
    OrderStatus: 'ACTIVE',
    BookingStatus: 'CHECKOUT',
    Note: null,
  };
  const records: CheckInOutRecord[] = [
    baseRecord,
    {
      ...baseRecord,
      id: 'merchant-cancel',
      PaymentStatus: MERCHANT_CANCEL_STATUS,
      BookingStatus: 'MERCHANT_CANCEL',
    },
    {
      ...baseRecord,
      id: 'order-cancel',
      PaymentStatus: ORDER_CANCEL_STATUS,
      OrderStatus: 'CANCEL',
    },
  ];

  it('excludes cancellation records from the default active filter', () => {
    expect(filterCheckInOutRecords(records, DEFAULT_CHECK_IN_OUT_STATUS_FILTER).map((row) => row.id))
      .toEqual(['base']);
  });

  it('supports explicit payment and cancellation filters', () => {
    expect(filterCheckInOutRecords(records, 'PAID').map((row) => row.id)).toEqual(['base']);
    expect(filterCheckInOutRecords(records, MERCHANT_CANCEL_STATUS).map((row) => row.id))
      .toEqual(['merchant-cancel']);
    expect(filterCheckInOutRecords(records, ORDER_CANCEL_STATUS).map((row) => row.id))
      .toEqual(['order-cancel']);
  });
});
