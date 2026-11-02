// Directories start with clinic-owned master records, then attach activity.
// Keep exact phone joins: suffix matches can merge different members.
export function escapeSqlString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

interface DirectoryClinic {
  id: string;
  code: string;
}

function buildMemberProfilesCte(clinicId: string) {
  const metadataField = (key: string) => `COALESCE(
    NULLIF(JSON_VALUE(SAFE.PARSE_JSON(cm.metadata), '$.${key}'), ''),
    NULLIF(JSON_VALUE(SAFE.PARSE_JSON(m.metadata), '$.${key}'), '')
  )`;
  return `MemberProfiles AS (
    SELECT
      cm.id,
      cm.phonenumber AS PhoneNumber,
      COALESCE(NULLIF(TRIM(cm.name), ''), NULLIF(TRIM(m.name), ''), 'Unknown') AS CustomerName,
      COALESCE(NULLIF(cm.member_id, ''), NULLIF(m.member_id, '')) AS MemberId,
      ${metadataField('dateOfBirth')} AS DateOfBirth,
      ${metadataField('gender')} AS Gender,
      ${metadataField('address')} AS Address,
      FORMAT_TIMESTAMP('%Y-%m-%d', TIMESTAMP(cm.created_at), 'Asia/Yangon') AS CreatedDate
    FROM great_time.clinic_members cm
    LEFT JOIN great_time.members m ON m.phonenumber = cm.phonenumber
    WHERE cm.clinic_id = '${clinicId}'
  )`;
}

export function buildCustomerDirectoryQuery(clinic: DirectoryClinic, searchTerm = '') {
  const clinicCode = escapeSqlString(clinic.code);
  const clinicId = escapeSqlString(clinic.id);
  const search = escapeSqlString(searchTerm.toLowerCase());
  // STRPOS treats quotes, percent and underscore as literal search text.
  const searchCondition = searchTerm ? `AND (
    STRPOS(LOWER(d.CustomerName), '${search}') > 0
    OR STRPOS(LOWER(d.PhoneNumber), '${search}') > 0
    OR STRPOS(LOWER(COALESCE(p.MemberId, s.MemberId, '')), '${search}') > 0
  )` : '';
  return `
      WITH CustomerInvoices AS (
        SELECT
          CustomerName,
          CustomerPhoneNumber,
          ANY_VALUE(MemberId) AS MemberId,
          OrderId,
          InvoiceNumber,
          MAX(SAFE_CAST(NetTotal AS FLOAT64)) AS InvoiceNetTotal,
          ANY_VALUE(UPPER(TRIM(PaymentMethod))) AS OrderPaymentMethod
        FROM
          great_time.MainPaymentView
        WHERE
          CustomerName IS NOT NULL
          AND CustomerPhoneNumber IS NOT NULL
          AND InvoiceNumber IS NOT NULL
          AND PaymentStatus IN ('PAID', 'PARTIAL_PAID')
          AND SAFE_CAST(NetTotal AS FLOAT64) > 0
          AND LOWER(ClinicCode) = LOWER('${clinicCode}')
        GROUP BY
          CustomerName,
          CustomerPhoneNumber,
          OrderId,
          InvoiceNumber
      ),
      CustomerInvoiceSummary AS (
        SELECT
          CustomerPhoneNumber,
          COUNT(DISTINCT InvoiceNumber) AS TotalInvoices,
          SUM(InvoiceNetTotal) AS TotalInvoiceValue
        FROM CustomerInvoices
        GROUP BY CustomerPhoneNumber
      ),
      CustomerSpend AS (
        SELECT
          i.CustomerPhoneNumber,
          ANY_VALUE(i.MemberId) AS MemberId,
          SUM(CASE
            WHEN p.id IS NOT NULL
              AND COALESCE(NULLIF(UPPER(TRIM(p.payment_method)), ''), i.OrderPaymentMethod, 'UNKNOWN') != 'PASS'
              THEN SAFE_CAST(p.payment_amount AS FLOAT64)
            WHEN p.id IS NULL AND i.OrderPaymentMethod NOT IN ('PASS', 'SPLIT', 'MIXED')
              THEN i.InvoiceNetTotal
            ELSE 0
          END) AS TotalSpend
        FROM
          CustomerInvoices i
        LEFT JOIN
          great_time.order_payments p
        ON
          p.order_id = i.OrderId
          AND p.is_increasement = 1
          AND SAFE_CAST(p.payment_amount AS FLOAT64) > 0
        GROUP BY
          i.CustomerPhoneNumber
      ),
      ${buildMemberProfilesCte(clinicId)},
      PackageStates AS (
        SELECT
          q.CustomerPhoneNumber,
          TRIM(q.ServiceName) AS ServiceName,
          GREATEST(COALESCE(SAFE_CAST(q.PackageCount AS INT64), 0), 0) AS PackageCount,
          GREATEST(COALESCE(SAFE_CAST(q.RemainingPackageCount AS INT64), 0), 0) AS RemainingPackageCount
        FROM
          great_time.MainDataView q
        WHERE
          q.CustomerName IS NOT NULL
          AND q.CustomerPhoneNumber IS NOT NULL
          AND q.ServiceName IS NOT NULL
          AND (q.PackageCount IS NOT NULL OR q.RemainingPackageCount IS NOT NULL)
          AND LOWER(q.ClinicCode) = LOWER('${clinicCode}')
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY q.CustomerPhoneNumber, TRIM(q.ServiceName)
          ORDER BY q.CheckInTime DESC, q.CheckOutTime DESC
        ) = 1
      ),
      PackageSummary AS (
        SELECT
          CustomerPhoneNumber,
          SUM(PackageCount) AS TotalPackageCount,
          SUM(RemainingPackageCount) AS RemainingCount
        FROM
          PackageStates
        GROUP BY
          CustomerPhoneNumber
      ),
      CustomerInfo AS (
        SELECT
          q.CustomerPhoneNumber,
          ARRAY_AGG(q.CustomerName ORDER BY COALESCE(q.CheckOutTime, q.CheckInTime) DESC LIMIT 1)[OFFSET(0)] AS CustomerName,
          ARRAY_AGG(
            NULLIF(CAST(q.DateOfBirth AS STRING), '') IGNORE NULLS
            ORDER BY COALESCE(q.CheckOutTime, q.CheckInTime) DESC
            LIMIT 1
          )[SAFE_OFFSET(0)] AS DateOfBirth,
          COUNT(DISTINCT q.BookingID) AS TotalVisits,
          FORMAT_TIMESTAMP('%d %b, %Y', MAX(COALESCE(q.CheckOutTime, q.CheckInTime))) AS LastVisited,
          ARRAY_AGG(
            NULLIF(q.ServiceName, '') IGNORE NULLS
            ORDER BY COALESCE(q.CheckOutTime, q.CheckInTime) DESC
            LIMIT 1
          )[SAFE_OFFSET(0)] AS LastService,
          ARRAY_AGG(
            NULLIF(q.PractitionerName, '') IGNORE NULLS
            ORDER BY COALESCE(q.CheckOutTime, q.CheckInTime) DESC
            LIMIT 1
          )[SAFE_OFFSET(0)] AS Therapist
        FROM
          great_time.MainDataView q
        WHERE
          q.CustomerName IS NOT NULL
          AND q.CustomerPhoneNumber IS NOT NULL
          AND q.CheckInTime IS NOT NULL
          AND LOWER(q.ClinicCode) = LOWER('${clinicCode}')
        GROUP BY
          q.CustomerPhoneNumber
      ),
      CustomerDirectory AS (
        SELECT p.PhoneNumber, p.CustomerName FROM MemberProfiles p
        UNION DISTINCT
        SELECT i.CustomerPhoneNumber, i.CustomerName FROM CustomerInfo i
        WHERE NOT EXISTS (SELECT 1 FROM MemberProfiles p WHERE p.PhoneNumber = i.CustomerPhoneNumber)
        UNION DISTINCT
        SELECT i.CustomerPhoneNumber, ANY_VALUE(i.CustomerName) FROM CustomerInvoices i
        WHERE NOT EXISTS (SELECT 1 FROM MemberProfiles p WHERE p.PhoneNumber = i.CustomerPhoneNumber)
          AND NOT EXISTS (SELECT 1 FROM CustomerInfo a WHERE a.CustomerPhoneNumber = i.CustomerPhoneNumber)
        GROUP BY i.CustomerPhoneNumber
      )
      SELECT
        COALESCE(p.id, CONCAT('activity:', d.PhoneNumber)) AS id,
        COALESCE(p.MemberId, s.MemberId, 'N/A') AS memberId,
        d.CustomerName AS name,
        d.PhoneNumber AS phoneNumber,
        COALESCE(p.DateOfBirth, i.DateOfBirth) AS dob,
        COALESCE(p.Gender, 'N/A') AS gender,
        COALESCE(p.Address, 'N/A') AS address,
        COALESCE(p.CreatedDate, 'N/A') AS createdDate,
        COALESCE(s.TotalSpend, 0) AS totalSpend,
        COALESCE(v.TotalInvoiceValue, 0) AS totalInvoiceValue,
        COALESCE(v.TotalInvoices, 0) AS totalInvoices,
        COALESCE(i.TotalVisits, 0) AS totalVisits,
        COALESCE(ps.TotalPackageCount, 0) AS totalPackageCount,
        COALESCE(ps.RemainingCount, 0) AS remainingCount,
        i.LastVisited AS lastVisited,
        i.LastService AS lastService,
        i.Therapist AS therapist
      FROM CustomerDirectory d
      LEFT JOIN CustomerInfo i ON d.PhoneNumber = i.CustomerPhoneNumber
      LEFT JOIN CustomerSpend s ON d.PhoneNumber = s.CustomerPhoneNumber
      LEFT JOIN CustomerInvoiceSummary v ON d.PhoneNumber = v.CustomerPhoneNumber
      LEFT JOIN MemberProfiles p ON d.PhoneNumber = p.PhoneNumber
      LEFT JOIN PackageSummary ps ON d.PhoneNumber = ps.CustomerPhoneNumber
      WHERE 1=1 ${searchCondition}
      ORDER BY totalSpend DESC, name, phoneNumber
      `;
}

export function buildCustomerProfileQuery(clinic: DirectoryClinic, phoneNumber: string) {
  const clinicId = escapeSqlString(clinic.id);
  const clinicCode = escapeSqlString(clinic.code);
  const phone = escapeSqlString(phoneNumber);
  return `WITH ${buildMemberProfilesCte(clinicId)},
    Activity AS (
      SELECT
        ANY_VALUE(CustomerName) AS name,
        ARRAY_AGG(NULLIF(CAST(DateOfBirth AS STRING), '') IGNORE NULLS
          ORDER BY CheckInTime DESC LIMIT 1)[SAFE_OFFSET(0)] AS dateOfBirth,
        CAST(SUM(SAFE_CAST(Price AS FLOAT64)) AS INT64) AS total_purchase_amount,
        COUNT(DISTINCT ServiceName) AS total_services,
        FORMAT_TIMESTAMP('%d %b, %Y %I:%M %p', MAX(CheckInTime)) AS last_appointment,
        COUNT(DISTINCT IF(CheckInTime IS NOT NULL, BookingID, NULL)) AS total_appointments
      FROM great_time.MainDataView
      WHERE CustomerPhoneNumber = '${phone}' AND LOWER(ClinicCode) = LOWER('${clinicCode}')
    ),
    InvoiceProfile AS (
      SELECT ANY_VALUE(CustomerName) AS name
      FROM great_time.MainPaymentView
      WHERE CustomerPhoneNumber = '${phone}' AND LOWER(ClinicCode) = LOWER('${clinicCode}')
    )
    SELECT
      COALESCE(p.CustomerName, a.name, i.name) AS name,
      '${phone}' AS phone,
      COALESCE(p.DateOfBirth, a.dateOfBirth) AS dateOfBirth,
      COALESCE(a.total_purchase_amount, 0) AS total_purchase_amount,
      a.total_services,
      a.last_appointment,
      a.total_appointments
    FROM Activity a
    CROSS JOIN InvoiceProfile i
    LEFT JOIN MemberProfiles p ON p.PhoneNumber = '${phone}'
    WHERE p.id IS NOT NULL OR a.name IS NOT NULL OR i.name IS NOT NULL`;
}

function buildServiceDirectoryCtes(clinic: DirectoryClinic) {
  const clinicId = escapeSqlString(clinic.id);
  const clinicCode = escapeSqlString(clinic.code);
  // The existing detail route is name-based; keep one row per service name.
  // Retain historical services even when no longer present in the catalog.
  return `Catalog AS (
    SELECT id, name, description, CAST(duration AS STRING) AS duration,
      SAFE_CAST(price AS FLOAT64) AS price, image
    FROM great_time.ServicesView
    WHERE clinic_id = '${clinicId}' AND name IS NOT NULL
    QUALIFY ROW_NUMBER() OVER (
      PARTITION BY name ORDER BY COALESCE(updated_at, created_at) DESC, id
    ) = 1
  ),
  ServiceActivity AS (
    SELECT ServiceName AS name,
      MAX(ServiceDescription) AS description,
      CAST(MAX(ServiceDuration) AS STRING) AS duration,
      AVG(SAFE_CAST(Price AS FLOAT64)) AS price,
      COUNT(*) AS count,
      MAX(ServiceImage) AS image,
      COUNT(DISTINCT BookingID) AS total_bookings,
      COUNT(DISTINCT CustomerName) AS total_customers,
      CAST(SUM(SAFE_CAST(Price AS FLOAT64)) AS INT64) AS total_revenue,
      FORMAT_TIMESTAMP('%d %b, %Y %I:%M %p', MAX(CheckInTime)) AS last_booking_date
    FROM great_time.MainDataView
    WHERE LOWER(ClinicCode) = LOWER('${clinicCode}') AND ServiceName IS NOT NULL
    GROUP BY ServiceName
  ),
  ServiceDirectory AS (
    SELECT COALESCE(c.id, CONCAT('activity:', a.name)) AS id,
      COALESCE(c.name, a.name) AS name,
      COALESCE(c.description, a.description) AS description,
      COALESCE(c.duration, a.duration) AS duration,
      COALESCE(c.price, a.price, 0) AS price,
      COALESCE(c.image, a.image) AS image,
      COALESCE(a.count, 0) AS count,
      COALESCE(a.total_bookings, 0) AS total_bookings,
      COALESCE(a.total_customers, 0) AS total_customers,
      COALESCE(a.total_revenue, 0) AS total_revenue,
      a.last_booking_date
    FROM Catalog c FULL OUTER JOIN ServiceActivity a ON c.name = a.name
  )`;
}

export function buildServiceDirectoryQuery(clinic: DirectoryClinic) {
  return `WITH ${buildServiceDirectoryCtes(clinic)}
    SELECT * FROM ServiceDirectory ORDER BY count DESC, name`;
}

export function buildServiceProfileQuery(clinic: DirectoryClinic, name: string) {
  return `WITH ${buildServiceDirectoryCtes(clinic)}
    SELECT * FROM ServiceDirectory WHERE name = '${escapeSqlString(name)}'`;
}
