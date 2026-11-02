import type { SalesDetailRecord } from '../api/apicoreSalesReports';

type SalesDetailDisplayRecord = Omit<SalesDetailRecord, 'CustomerPhoneNumber' | 'InvoiceNetTotal'> & {
  InvoiceNetTotal: number | null;
};

export function buildSalesDetailDisplayRows(
  data: SalesDetailRecord[],
  viewMode: 'detailed' | 'summary',
): SalesDetailDisplayRecord[] {
  const filteredData = data;

  // If in summary view, group by invoice number
  if (viewMode === 'summary') {
    const invoiceSummary: Record<string, SalesDetailRecord> = {};
    const servicesMap: Record<string, string[]> = {};
    const practitionersMap: Record<string, Set<string>> = {};

    // First pass: collect unique invoices and their services
    data.forEach(record => {
      const invoiceNum = record.InvoiceNumber;

      // Initialize invoice record if not exists
      if (!invoiceSummary[invoiceNum]) {
        invoiceSummary[invoiceNum] = { ...record, ItemDiscount: null };
        servicesMap[invoiceNum] = [];
        practitionersMap[invoiceNum] = new Set<string>();
      }

      if (record.ItemDiscount !== null) {
        invoiceSummary[invoiceNum].ItemDiscount =
          (invoiceSummary[invoiceNum].ItemDiscount ?? 0) + record.ItemDiscount;
      }

      // Add service to the services list
      if (record.ServiceName) {
        servicesMap[invoiceNum].push(record.ServiceName);
      }

      if (record.ServicePackageName) {
        servicesMap[invoiceNum].push(record.ServicePackageName);
      }

      record.PractitionerName
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .forEach((name) => practitionersMap[invoiceNum].add(name));
    });

    // Second pass: Create summary records with concatenated services
    return Object.keys(invoiceSummary).map(invoiceNum => {
      const record = invoiceSummary[invoiceNum];
      const services = servicesMap[invoiceNum];

      return {
        ...record,
        PractitionerName: Array.from(practitionersMap[invoiceNum]).join(', '),
        ServiceName: services.length > 0 ? services.join(', ') : null,
        ServicePackageName: null, // In summary view, we combine these
      };
    });
  }

  // Keep the existing table column order and invoice-level suppression.
  const result = filteredData.map((record, index) => {
    // Check if this is the first occurrence of this invoice number
    const isFirstInvoiceRow = index === 0 || filteredData[index - 1].InvoiceNumber !== record.InvoiceNumber;

    return {
      Date: record.Date,
      InvoiceNumber: record.InvoiceNumber,
      CustomerName: record.CustomerName,
      MemberId: record.MemberId,
      SalePerson: record.SalePerson,
      PractitionerName: record.PractitionerName,
      ServiceName: record.ServiceName, // Always show service name for each item
      ServicePackageName: record.ServicePackageName,
      WalletTopUp: record.WalletTopUp,
      ItemQuantity: record.ItemQuantity, // Always show item details for each item
      ItemPrice: record.ItemPrice,
      ItemDiscount: record.ItemDiscount,
      ItemTotal: record.ItemTotal,
      SubTotal: record.SubTotal,
      Total: isFirstInvoiceRow ? record.Total : null, // Show only on first row of invoice
      Discount: isFirstInvoiceRow ? record.Discount : null, // Show only on first row of invoice
      NetTotal: isFirstInvoiceRow ? record.NetTotal : null, // Show only on first row of invoice
      OrderBalance: isFirstInvoiceRow ? record.OrderBalance : null, // Show only on first row of invoice
      OrderCreditBalance: isFirstInvoiceRow ? record.OrderCreditBalance : null, // Show only on first row of invoice
      Tax: isFirstInvoiceRow ? record.Tax : null, // Show only on first row of invoice
      InvoiceNetTotal: isFirstInvoiceRow ? record.InvoiceNetTotal : null, // Show only on first row of invoice
      PaymentStatus: record.PaymentStatus, // Show payment details only when there's a payment for this item
      PaymentMethod: record.PaymentMethod,
      PaymentType: record.PaymentType,
      PaymentAmount: record.PaymentAmount,
      Note: isFirstInvoiceRow ? record.Note : null,
      PaymentNote: record.PaymentNote
    };
  });

  return result;
}

export function buildSalesDetailExportRows(records: SalesDetailDisplayRecord[]) {
  // Use the processed dataToDisplay which already handles the logic for showing/hiding fields
  const processedRows: any[] = [];

  records.forEach((record) => {
    // Format the wallet value
    let walletValue = '';
    if (record.WalletTopUp) {
      if (String(record.WalletTopUp).includes('*Point') || (typeof record.WalletTopUp === 'number' && record.WalletTopUp > 0)) {
        walletValue = 'Topup';
      } else {
        walletValue = String(record.WalletTopUp);
      }
    }

    processedRows.push({
      'Date': record.Date,
      'Invoice Number': record.InvoiceNumber,
      'Customer Name': record.CustomerName,
      'Member ID': record.MemberId || '',
      'Sale Person': record.SalePerson || '',
      'Practitioner': record.PractitionerName || '',
      'Service Name': record.ServiceName || '',
      'Service Package': record.ServicePackageName || '',
      'Wallet': walletValue,
      'Item Quantity': record.ItemQuantity || '',
      'Item Price': record.ItemPrice || '',
      'Item Discount': record.ItemDiscount ?? '',
      'Item Total': record.ItemTotal || '',
      'Sub Total': record.SubTotal || '',
      'Total': record.Total || '',
      'Discount': record.Discount || '',
      'Net Total': record.NetTotal || '',
      'Order Balance': record.OrderBalance || '',
      'Order Credit Balance': record.OrderCreditBalance || '',
      'Tax': record.Tax || '',
      'Invoice Total': record.InvoiceNetTotal || '',
      'Payment Status': record.PaymentStatus || '',
      'Payment Method': record.PaymentMethod || '',
      'Payment Type': record.PaymentType || '',
      'Payment Amount': record.PaymentAmount || '',
      'Note': record.Note || '',
      'Payment Note': record.PaymentNote || ''
    });
  });
  return processedRows;
}
