import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// BigQuery executes these literal CTE fixtures without creating or changing tables.
const fixtures = `
fx_members AS (
  SELECT CONCAT('member-', CAST(n AS STRING)) AS id,
    CONCAT('Global ', CAST(n AS STRING)) AS name,
    IF(n = 105, '+44555000000001', CONCAT('+959', FORMAT('%09d', n))) AS phonenumber,
    CONCAT('global-', CAST(n AS STRING)) AS member_id,
    '{"gender":"Female","dateOfBirth":"1990-01-02","address":"Global address"}' AS metadata
  FROM UNNEST(GENERATE_ARRAY(1, 105)) n
),
fx_clinic_members AS (
  SELECT CONCAT('profile-', CAST(n AS STRING)) AS id,
    CONCAT('Customer ', FORMAT('%03d', n)) AS name,
    IF(n = 105, '+44555000000001', CONCAT('+959', FORMAT('%09d', n))) AS phonenumber,
    CONCAT('local-', CAST(n AS STRING)) AS member_id,
    'clinic-a' AS clinic_id, '{"address":"Clinic address"}' AS metadata,
    DATETIME '2026-10-01 00:00:00' AS created_at
  FROM UNNEST(GENERATE_ARRAY(1, 105)) n
  UNION ALL
  SELECT 'foreign-profile', 'Foreign name', '+959000000001', 'foreign-id',
    'clinic-b', '{"gender":"Male","address":"Foreign address"}', DATETIME '2026-10-01 00:00:00'
),
fx_activity AS (
  SELECT CONCAT('Historical ', CAST(n AS STRING)) AS CustomerName,
    CONCAT('+959', FORMAT('%09d', n)) AS CustomerPhoneNumber,
    '1990-01-02' AS DateOfBirth, CONCAT('booking-', CAST(n AS STRING)) AS BookingID,
    TIMESTAMP '2026-11-01 04:00:00+00' AS CheckInTime,
    TIMESTAMP '2026-11-01 05:00:00+00' AS CheckOutTime,
    IF(n = 1, 'Catalog 001', 'Retired') AS ServiceName,
    'History description' AS ServiceDescription, 60 AS ServiceDuration,
    CAST(NULL AS STRING) AS ServiceImage, 'Therapist' AS PractitionerName,
    3 AS PackageCount, 2 AS RemainingPackageCount, 100 AS Price, 'code-a' AS ClinicCode
  FROM UNNEST([1, 1, 200]) n
  UNION ALL
  SELECT 'Foreign name', '+959000000001', '2000-01-01', 'foreign-booking',
    TIMESTAMP '2026-11-02 04:00:00+00', TIMESTAMP '2026-11-02 05:00:00+00',
    'Foreign service', 'Foreign description', 60, NULL, 'Foreign therapist', 99, 98, 999, 'code-b'
),
fx_invoices AS (
  SELECT CONCAT('Ledger ', CAST(n AS STRING)) AS CustomerName,
    CONCAT('+959', FORMAT('%09d', n)) AS CustomerPhoneNumber,
    CONCAT('invoice-member-', CAST(n AS STRING)) AS MemberId,
    CONCAT('order-', CAST(n AS STRING)) AS OrderId,
    CONCAT('invoice-', CAST(n AS STRING)) AS InvoiceNumber,
    CASE n WHEN 1 THEN 1000 WHEN 3 THEN 500 WHEN 4 THEN 250 ELSE 50 END AS NetTotal,
    CASE n WHEN 1 THEN 'SPLIT' WHEN 4 THEN 'PASS' ELSE 'CASH' END AS PaymentMethod,
    IF(n = 3, 'PARTIAL_PAID', 'PAID') AS PaymentStatus, 'code-a' AS ClinicCode
  FROM UNNEST([1, 1, 3, 4, 201]) n
  UNION ALL
  SELECT 'Foreign name', '+959000000001', 'foreign-id', 'foreign-order', 'foreign-invoice',
    999, 'CASH', 'PAID', 'code-b'
),
fx_payments AS (
  SELECT 'cash-1' AS id, 'order-1' AS order_id, 1 AS is_increasement, 400 AS payment_amount, 'CASH' AS payment_method
  UNION ALL SELECT 'pass-1', 'order-1', 1, 600, 'PASS'
  UNION ALL SELECT 'refund-1', 'order-1', 0, 500, 'CASH'
  UNION ALL SELECT 'cash-3', 'order-3', 1, 200, 'CASH'
  UNION ALL SELECT 'pass-4', 'order-4', 1, 250, 'PASS'
),
fx_services AS (
  SELECT CONCAT('service-', CAST(n AS STRING)) AS id,
    CONCAT('Catalog ', FORMAT('%03d', n)) AS name, 'Catalog description' AS description,
    30 AS duration, 500 AS price, CAST(NULL AS STRING) AS image, 'clinic-a' AS clinic_id,
    DATETIME '2026-10-01 00:00:00' AS created_at, CAST(NULL AS DATETIME) AS updated_at
  FROM UNNEST(GENERATE_ARRAY(1, 105)) n
  UNION ALL
  SELECT 'foreign-service', 'Catalog 001', 'Foreign description', 99, 999, NULL,
    'clinic-b', DATETIME '2026-10-01 00:00:00', NULL
)`;

function withFixtures(query) {
  let sql = query.trim().replace(/^WITH\s+/i, '');
  for (const [source, fixture] of Object.entries({
    clinic_members: 'fx_clinic_members', members: 'fx_members',
    MainDataView: 'fx_activity', MainPaymentView: 'fx_invoices',
    order_payments: 'fx_payments', ServicesView: 'fx_services',
  })) sql = sql.replaceAll(`great_time.${source}`, fixture);
  return `WITH ${fixtures}, ${sql}`;
}

export async function checkDirectoryQueries(builders, execute) {
  const clinic = { id: 'clinic-a', code: 'code-a' };
  const customers = await execute(withFixtures(builders.buildCustomerDirectoryQuery(clinic)));
  assert.equal(customers.length, 107, 'include >100 master records, activity-only and invoice-only customers');
  assert.equal(new Set(customers.map(row => row.phoneNumber)).size, 107, 'one row per exact phone');
  const first = customers.find(row => row.memberId === 'local-1');
  assert.equal(first.name, 'Customer 001', 'prefer this clinic profile over global and historical names');
  assert.equal(first.address, 'Clinic address');
  assert.equal(first.gender, 'Female', 'fallback per metadata field');
  assert.equal(first.totalVisits, 1, 'count unique bookings');
  assert.equal(first.totalSpend, 400, 'exclude PASS and non-increasing payments');
  assert.equal(first.totalInvoiceValue, 1000, 'do not duplicate invoice totals across line items');
  assert.equal(first.totalInvoices, 1);
  assert.equal(customers.find(row => row.memberId === 'local-3').totalSpend, 200, 'partial paid amount');
  assert.equal(customers.find(row => row.memberId === 'local-4').totalSpend, 0, 'PASS-only purchase');
  assert.equal(customers.find(row => row.memberId === 'local-105').totalVisits, 0, 'same phone suffix is a different identity');
  assert.equal(customers.reduce((sum, row) => sum + row.totalSpend, 0), 650);
  assert.equal(customers.reduce((sum, row) => sum + row.totalInvoiceValue, 0), 1800);
  assert.ok(!customers.some(row => row.name === 'Foreign name'), 'exclude other clinic profiles and activity');

  const searched = await execute(withFixtures(builders.buildCustomerDirectoryQuery(clinic, 'local-105')));
  assert.equal(searched.length, 1, 'find imported members beyond the previous 100-row limit');
  assert.equal(searched[0].memberId, 'local-105');
  const literalSearch = await execute(withFixtures(builders.buildCustomerDirectoryQuery(clinic, "'_%\\")));
  assert.equal(literalSearch.length, 0, 'treat SQL and wildcard characters as literal search text');

  const profile = await execute(withFixtures(builders.buildCustomerProfileQuery(clinic, '+44555000000001')));
  assert.equal(profile.length, 1, 'open a member without activity');
  assert.equal(profile[0].total_appointments, 0);
  assert.equal(profile[0].total_purchase_amount, 0);
  const missingProfile = await execute(withFixtures(builders.buildCustomerProfileQuery(clinic, '+959999999999')));
  assert.equal(missingProfile.length, 0, 'unknown member must not get an empty fabricated profile');
  const invoiceProfile = await execute(withFixtures(builders.buildCustomerProfileQuery(clinic, '+959000000201')));
  assert.equal(invoiceProfile.length, 1, 'open a historical customer with invoices and no visits');
  assert.equal(invoiceProfile[0].name, 'Ledger 201');

  const services = await execute(withFixtures(builders.buildServiceDirectoryQuery(clinic)));
  assert.equal(services.length, 106, 'include >100 catalog services plus historical services');
  assert.equal(services.find(row => row.name === 'Catalog 001').price, 500, 'use this clinic catalog price');
  assert.equal(services.find(row => row.name === 'Catalog 105').count, 0);
  assert.ok(!services.some(row => row.name === 'Foreign service'));
  const service = await execute(withFixtures(builders.buildServiceProfileQuery(clinic, 'Catalog 105')));
  assert.equal(service.length, 1, 'open an unused catalog service');
  assert.equal(service[0].total_bookings, 0);
  assert.equal(service[0].total_revenue, 0);
  return { fixtureQueries: 8, customerRows: customers.length, serviceRows: services.length };
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const endpoint = process.env.BI_READ_ONLY_QUERY_URL;
  if (!endpoint) throw new Error('Set BI_READ_ONLY_QUERY_URL to the confirmed BI /query endpoint. Runs SELECT fixtures only.');
  const ts = await import('typescript');
  const compiler = ts.default || ts;
  const source = await readFile(new URL('../src/utils/directoryQueries.ts', import.meta.url), 'utf8');
  const js = compiler.transpileModule(source, { compilerOptions: { module: compiler.ModuleKind.ESNext } }).outputText;
  const builders = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const result = await checkDirectoryQueries(builders, async query => {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || data.message || 'Query failed');
    return data.data;
  });
  console.log(result);
}
