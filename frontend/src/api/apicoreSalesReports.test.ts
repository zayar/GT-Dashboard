import { describe, expect, it } from 'vitest';
import {
  buildPaymentOrderWhere,
  buildSalesOrderWhere,
  mapPaymentReportRecords,
  mapSalesDetailRecords,
  resolveReportDateRange,
} from './apicoreSalesReports';

const order = {
  id: 'order-uuid',
  order_id: 'SO-001',
  member_id: 'member-uuid',
  created_at: '2026-07-24T03:00:00.000Z',
  status: 'ACTIVE',
  total: '220000',
  net_total: '200000',
  discount: '20000',
  tax: '0',
  balance: '200000',
  credit_balance: '0',
  payment_method: 'SPLIT',
  payment_status: 'PAID',
  metadata: '{"merchant_note":" Birthday Gift Voucher "}',
  member: {
    name: 'Global Name',
    member_id: 'GLOBAL-1',
    clinic_members: [{
      name: 'Clinic Name',
      member_id: 'CLINIC-7',
    }],
  },
  user: {
    name: 'Created By',
  },
  seller: {
    display_name: 'Seller Name',
  },
  payments: [
    {
      id: 'payment-1',
      payment_amount: '120000',
      payment_method: 'KPAY',
      payment_note: 'first',
      payment_date: '2026-07-24T03:30:00.000Z',
    },
    {
      id: 'payment-2',
      payment_amount: '80000',
      payment_method: 'CASH',
      payment_note: null,
      payment_date: '2026-07-24T04:00:00.000Z',
    },
  ],
  order_items: [
    {
      id: 'item-1',
      quantity: 1,
      price: '100000',
      total: '100000',
      service: { name: 'Facial' },
      service_package: null,
      product_stock_item: null,
    },
    {
      id: 'item-2',
      quantity: 1,
      price: '100000',
      total: '100000',
      service: { name: 'Facial' },
      service_package: null,
      product_stock_item: null,
    },
  ],
};

describe('APICORE sales and payment reports', () => {
  it('builds Myanmar calendar boundaries for order and payment queries', () => {
    const range = resolveReportDateRange({
      filterType: 'day',
      startDate: new Date(2026, 6, 24),
      endDate: new Date(2026, 6, 24),
      selectedDate: null,
    });

    expect(buildSalesOrderWhere({
      clinicId: 'clinic-uuid',
      ...range,
    })).toEqual({
      clinic_id: { equals: 'clinic-uuid' },
      status: { not: 'CANCEL' },
      created_at: {
        gte: '2026-07-23T17:30:00.000Z',
        lte: '2026-07-24T17:29:59.999Z',
      },
    });

    expect(buildPaymentOrderWhere({
      clinicId: 'clinic-uuid',
      ...range,
    })).toEqual({
      clinic_id: { equals: 'clinic-uuid' },
      status: { equals: 'ACTIVE' },
      payments: {
        some: {
          payment_date: {
            gte: '2026-07-23T17:30:00.000Z',
            lte: '2026-07-24T17:29:59.999Z',
          },
        },
      },
    });
  });

  it('resolves the final day of the selected month', () => {
    const range = resolveReportDateRange({
      filterType: 'month',
      startDate: null,
      endDate: null,
      selectedDate: new Date(2026, 6, 15),
    });

    expect(range.startDate).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
    expect(range.endDate).toEqual(new Date(2026, 6, 31, 23, 59, 59, 999));
  });

  it('maps realtime orders, item lines, clinic member identity, and split payments', () => {
    const rows = mapSalesDetailRecords([order] as any);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      Date: '2026-07-24',
      InvoiceNumber: 'SO-001',
      CustomerName: 'Clinic Name',
      MemberId: 'CLINIC-7',
      SalePerson: 'Seller Name',
      ServiceName: 'Facial',
      PaymentMethod: 'KPAY',
      PaymentAmount: 120000,
      Note: 'Birthday Gift Voucher',
      InvoiceNetTotal: 200000,
    });
    expect(rows[1]).toMatchObject({
      ServiceName: 'Facial #2',
      PaymentMethod: 'CASH',
      PaymentAmount: 80000,
      Note: 'Birthday Gift Voucher',
    });
  });

  it('does not expose malformed or non-text order notes in Sales Details', () => {
    const malformedMetadataOrder = {
      ...order,
      id: 'malformed-metadata-order',
      metadata: '{not-json',
    };
    const nonTextNoteOrder = {
      ...order,
      id: 'non-text-note-order',
      metadata: '{"merchant_note":123}',
    };

    expect(mapSalesDetailRecords([malformedMetadataOrder] as any)[0].Note).toBeNull();
    expect(mapSalesDetailRecords([nonTextNoteOrder] as any)[0].Note).toBeNull();
  });

  it('excludes cancelled sales and never treats an outstanding balance as a payment', () => {
    const noPaymentOrder = {
      ...order,
      id: 'no-payment-order',
      order_id: 'SO-002',
      balance: '500000',
      payments: [],
      order_items: [order.order_items[0]],
    };
    const cancelledOrder = {
      ...order,
      id: 'cancelled-order',
      order_id: 'SO-003',
      status: 'CANCEL',
    };

    const rows = mapSalesDetailRecords([noPaymentOrder, cancelledOrder] as any);

    expect(rows).toHaveLength(1);
    expect(rows[0].InvoiceNumber).toBe('SO-002');
    expect(rows[0].PaymentAmount).toBeNull();
  });

  it('preserves distinct split payments even when their values are identical', () => {
    const splitOrder = {
      ...order,
      payments: [
        {
          id: 'payment-a',
          payment_amount: '100000',
          payment_method: 'CASH',
          payment_note: null,
          payment_date: '2026-07-24T03:30:00.000Z',
        },
        {
          id: 'payment-b',
          payment_amount: '100000',
          payment_method: 'CASH',
          payment_note: null,
          payment_date: '2026-07-24T03:30:00.000Z',
        },
      ],
    };

    const rows = mapPaymentReportRecords(
      [splitOrder] as any,
      new Date(2026, 6, 24, 0, 0, 0, 0),
      new Date(2026, 6, 24, 23, 59, 59, 999),
    );

    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum, row) => sum + row.PaymentAmount, 0)).toBe(200000);
  });

  it('uses payment timestamps and actual received amounts for the payment report', () => {
    const rows = mapPaymentReportRecords(
      [order] as any,
      new Date(2026, 6, 24, 0, 0, 0, 0),
      new Date(2026, 6, 24, 23, 59, 59, 999),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        Date: '2026-07-24',
        InvoiceNumber: 'SO-001',
        PaymentMethod: 'KPAY',
        PaymentAmount: 120000,
      }),
      expect.objectContaining({
        Date: '2026-07-24',
        InvoiceNumber: 'SO-001',
        PaymentMethod: 'CASH',
        PaymentAmount: 80000,
      }),
    ]);
  });
});
