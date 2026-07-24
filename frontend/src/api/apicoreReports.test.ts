import { describe, expect, it } from 'vitest';
import {
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
    expect(variables.orderBy).toEqual([{ in_time: 'desc' }, { id: 'desc' }]);
    expect(variables.skip).toBe(500);
    expect(variables.take).toBe(500);
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
            service_helper: { name: 'Helper A' },
          },
          orders: {
            order_id: 'INV-001',
            discount: '5000',
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
      Total: 40000,
      Discount: 5000,
      SellerName: 'Seller A',
    });
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
    Total: null,
    Discount: null,
    SellerName: null,
    VisitStatus: 'CHECKOUT',
    OrderStatus: 'ACTIVE',
    BookingStatus: 'CHECKOUT',
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
