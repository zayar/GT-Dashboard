import { describe, expect, it } from 'vitest';
import {
  buildPaymentOrderWhere,
  buildOutstandingOrderWhere,
  buildSalesOrderWhere,
  mapCreditReceivedRecords,
  mapOutstandingReportRecords,
  mapPaymentReportRecords,
  mapSalesDetailRecords,
  resolveReportDateRange,
} from './apicoreSalesReports';
import {
  buildSalesBySalesPersonTransactions,
  filterReportableSalesTransactions,
  summarizeSalesBySalesPerson,
} from '../utils/salesBySalesPerson';

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
    phonenumber: '09999999999',
    clinic_members: [{
      name: 'Clinic Name',
      member_id: 'CLINIC-7',
      phonenumber: '09123456789',
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
      status: { notIn: ['CANCEL'] },
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

    expect(buildOutstandingOrderWhere({
      clinicId: 'clinic-uuid',
      asOfDate: new Date(2026, 6, 24),
    })).toEqual({
      clinic_id: { equals: 'clinic-uuid' },
      status: { equals: 'ACTIVE' },
      created_at: {
        lte: '2026-07-24T17:29:59.999Z',
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
      CustomerPhoneNumber: '09123456789',
      MemberId: 'CLINIC-7',
      SalePerson: 'Seller Name',
      PractitionerName: '',
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

  it('shows all assigned practitioners at service-item grain for CO vouchers only', () => {
    const practitionerOrder = {
      ...order,
      order_id: 'CO-3435211',
      payments: [order.payments[0]],
      order_items: [{
        ...order.order_items[0],
        service: { id: 'service-ear-repair', name: 'Ear Lobe Repair (2 nos)' },
        practitioner: { name: 'Dr Zaw' },
      }],
      checkins: [
        {
          id: 'matching-checkin',
          service_id: 'service-ear-repair',
          status: 'CHECKOUT',
          practitioner: { name: 'Dr Zaw' },
          practitioners: [
            { status: 'ACTIVE', practitioner: { name: 'Dr Zaw' } },
            { status: 'ACTIVE', practitioner: { name: 'Hnin Wai Lwin' } },
            { status: 'CANCEL', practitioner: { name: 'Former Practitioner' } },
          ],
        },
        {
          id: 'other-service-checkin',
          service_id: 'different-service',
          status: 'CHECKOUT',
          practitioner: { name: 'Other Practitioner' },
          practitioners: [],
        },
      ],
    };

    expect(mapSalesDetailRecords([practitionerOrder] as any)[0]).toMatchObject({
      InvoiceNumber: 'CO-3435211',
      ServiceName: 'Ear Lobe Repair (2 nos)',
      PractitionerName: 'Dr Zaw, Hnin Wai Lwin',
    });
    expect(mapSalesDetailRecords([{
      ...practitionerOrder,
      order_id: 'SO-3435211',
    }] as any)[0].PractitionerName).toBe('');
  });

  it('uses recorded line discounts without multiplying by quantity or inferring price changes', () => {
    const rows = mapSalesDetailRecords([{
      ...order,
      order_items: [
        { ...order.order_items[0], quantity: 3, price: '35000', total: '100000', metadata: '{"discount":"5000"}' },
        { ...order.order_items[0], original_price: '50000', price: '45000', total: '40000', metadata: null },
        { ...order.order_items[0], metadata: '{not-json' },
        { ...order.order_items[0], metadata: '{"discount":-2000}' },
        { ...order.order_items[0], metadata: '{"discount":"invalid"}' },
        { ...order.order_items[0], metadata: '{"markup":2000}' },
        { ...order.order_items[0], metadata: '{"discount":1500.5}' },
      ],
    }] as any);

    expect(rows.map(row => row.ItemDiscount)).toEqual([5000, 0, 0, 0, 0, 0, 1500.5]);
    expect(rows[0].ItemTotal).toBe(100000);
    expect(rows[0].Discount).toBe(20000);
    expect(rows[0].InvoiceNetTotal).toBe(200000);
  });

  it('leaves item discounts blank on extra payment rows and invoices with no items', () => {
    const rows = mapSalesDetailRecords([{
      ...order,
      order_items: [{ ...order.order_items[0], metadata: '{"discount":5000}' }],
    }, {
      ...order,
      order_id: 'TO-002',
      order_items: [],
    }] as any);

    expect(rows.map(row => row.ItemDiscount)).toEqual([5000, null, null, null]);
  });

  it('shows assigned member IDs and leaves missing IDs blank instead of using the internal key', () => {
    const memberWithoutCodes = {
      ...order.member,
      member_id: '  ',
      clinic_members: [{ ...order.member.clinic_members[0], member_id: null }],
    };
    const rows = mapSalesDetailRecords([
      order,
      { ...order, member: { ...memberWithoutCodes, member_id: ' GLOBAL-9 ' } },
      { ...order, member: memberWithoutCodes },
      { ...order, member: null },
    ] as any);

    expect(rows.map(row => row.MemberId)).toEqual(['CLINIC-7', 'CLINIC-7', 'GLOBAL-9', 'GLOBAL-9', '', '', '', '']);
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

  it('reconciles gross sales separately from cash received across payment statuses', () => {
    const orderForStatus = (
      invoice: string,
      paymentStatus: string,
      netTotal: number,
      paymentAmount: number | null,
    ) => ({
      ...order,
      id: `${invoice}-id`,
      order_id: invoice,
      created_at: '2026-08-01T10:00:00.000Z',
      total: String(netTotal),
      net_total: String(netTotal),
      payment_status: paymentStatus,
      seller: { display_name: 'Hsu Yee' },
      payments: paymentAmount === null ? [] : [{
        id: `${invoice}-payment`,
        payment_amount: String(paymentAmount),
        payment_method: 'CASH',
        payment_note: null,
        payment_date: '2026-08-01T10:00:00.000Z',
      }],
      order_items: [{
        ...order.order_items[0],
        id: `${invoice}-item`,
        total: String(netTotal),
      }],
    });
    const orders = [
      orderForStatus('SO-PAID', 'PAID', 1_710_000, 1_710_000),
      orderForStatus('SO-924554', 'PARTIAL_PAID', 750_000, 400_000),
      orderForStatus('CO-3670176', 'UNPAID', 35_000, null),
    ];

    const outstandingRows = mapOutstandingReportRecords(
      orders as any,
      new Date(2026, 7, 1),
    );
    const salesTransactions = filterReportableSalesTransactions(
      buildSalesBySalesPersonTransactions(
        mapSalesDetailRecords(orders as any),
        outstandingRows,
      )
    );
    const salesSummary = summarizeSalesBySalesPerson(salesTransactions);
    const paymentRows = mapPaymentReportRecords(
      orders as any,
      new Date(2026, 7, 1, 0, 0, 0, 0),
      new Date(2026, 7, 1, 23, 59, 59, 999),
    );

    expect(salesSummary).toEqual([{
      salesPerson: 'Hsu Yee',
      transactionCount: 3,
      paidSales: 1_710_000,
      partialPaidSales: 400_000,
      partialOutstandingSales: 350_000,
      unpaidSales: 35_000,
      totalAmount: 2_495_000,
    }]);
    expect(paymentRows.reduce((sum, row) => sum + row.PaymentAmount, 0)).toBe(2_110_000);
    expect(paymentRows.map((row) => row.InvoiceNumber)).not.toContain('CO-3670176');
  });

  it('reconstructs outstanding balances at invoice grain as of a historical date', () => {
    const partialOrder = {
      ...order,
      id: 'partial-order',
      order_id: 'SO-924554',
      created_at: '2026-08-01T10:00:00.000Z',
      net_total: '750000',
      payment_status: 'PAID',
      payments: [
        {
          id: 'payment-before-snapshot',
          payment_amount: '400000',
          payment_method: 'CASH',
          payment_note: null,
          payment_date: '2026-08-01T10:30:00.000Z',
        },
        {
          id: 'payment-after-snapshot',
          payment_amount: '350000',
          payment_method: 'KPAY',
          payment_note: null,
          payment_date: '2026-08-02T10:30:00.000Z',
        },
      ],
    };
    const unpaidOrder = {
      ...order,
      id: 'unpaid-order',
      order_id: 'CO-3670176',
      created_at: '2026-08-01T08:00:00.000Z',
      net_total: '35000',
      payment_status: 'UNPAID',
      payments: [],
    };
    const agedOrder = {
      ...order,
      id: 'aged-order',
      order_id: 'SO-AGED',
      created_at: '2026-05-01T08:00:00.000Z',
      net_total: '100000',
      payment_status: 'UNPAID',
      payments: [],
    };

    const rows = mapOutstandingReportRecords(
      [partialOrder, unpaidOrder, agedOrder] as any,
      new Date(2026, 7, 1),
    );

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        InvoiceNumber: 'SO-924554',
        InvoiceTotal: 750000,
        AmountPaid: 400000,
        OutstandingBalance: 350000,
        PaymentStatus: 'PARTIAL_PAID',
        LastPaymentDate: '2026-08-01',
      }),
      expect.objectContaining({
        InvoiceNumber: 'CO-3670176',
        AmountPaid: 0,
        OutstandingBalance: 35000,
        PaymentStatus: 'UNPAID',
        AgingBucket: '0-30',
      }),
      expect.objectContaining({
        InvoiceNumber: 'SO-AGED',
        OutstandingBalance: 100000,
        AgingBucket: '90+',
      }),
    ]));
  });

  it('links later credit receipts to their original invoice and remaining balance', () => {
    const partialOrder = {
      ...order,
      id: 'partial-credit-order',
      order_id: 'SO-CREDIT-1',
      created_at: '2026-08-01T03:00:00.000Z',
      net_total: '750000',
      payment_status: 'PARTIAL_PAID',
      payments: [
        {
          id: 'initial-payment',
          payment_amount: '400000',
          payment_method: 'CASH',
          payment_note: null,
          payment_date: '2026-08-01T03:30:00.000Z',
        },
        {
          id: 'credit-receipt',
          payment_amount: '200000',
          payment_method: 'KPAY',
          payment_note: 'Old balance payment',
          payment_date: '2026-08-04T04:00:00.000Z',
        },
      ],
    };
    const fullyPaidOrder = {
      ...order,
      id: 'settled-credit-order',
      order_id: 'SO-CREDIT-2',
      created_at: '2026-08-02T03:00:00.000Z',
      net_total: '200000',
      payment_status: 'PAID',
      payments: [{
        id: 'settlement-receipt',
        payment_amount: '200000',
        payment_method: 'CASH',
        payment_note: null,
        payment_date: '2026-08-04T05:00:00.000Z',
      }],
    };

    const rows = mapCreditReceivedRecords(
      [partialOrder, fullyPaidOrder] as any,
      new Date(2026, 7, 4),
    );

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ReceiptId: 'credit-receipt',
        ReceivedDate: '2026-08-04',
        InvoiceDate: '2026-08-01',
        InvoiceNumber: 'SO-CREDIT-1',
        PaymentMethod: 'KPAY',
        PaymentAmount: 200000,
        PaymentNote: 'Old balance payment',
        InvoiceTotal: 750000,
        BalanceAfterPayment: 150000,
      }),
      expect.objectContaining({
        ReceiptId: 'settlement-receipt',
        InvoiceNumber: 'SO-CREDIT-2',
        PaymentAmount: 200000,
        BalanceAfterPayment: 0,
      }),
    ]));
    expect(rows.map((row) => row.ReceiptId)).not.toContain('initial-payment');
  });
});
