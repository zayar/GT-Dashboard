export const TREATMENT_REPORT_TIME_ZONE = 'Asia/Yangon';

export type TreatmentPerformanceMetric = 'treatmentReturns' | 'newPurchases' | 'totalActivity';

export interface TreatmentActivityQueryParams {
  clinicCode: string;
  clinicId: string;
  startDate: string;
  endDate: string;
  category?: string;
  practitioner?: string;
  services?: string[];
  timeZone?: string;
}

export const escapeTreatmentSqlLiteral = (value: string) => (
  value.replace(/\\/g, '\\\\').replace(/'/g, "''")
);

const assertDateKey = (value: string, fieldName: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`);
  }
};

const buildFilteredActivityWhere = (params: TreatmentActivityQueryParams) => {
  const clauses = ["activity_type IN ('TREATMENT_RETURN', 'NEW_PURCHASE')"];

  if (params.category) {
    clauses.push(`LOWER(service_category) = LOWER('${escapeTreatmentSqlLiteral(params.category)}')`);
  }

  if (params.practitioner) {
    clauses.push(`LOWER(practitioner_name) = LOWER('${escapeTreatmentSqlLiteral(params.practitioner)}')`);
  }

  const selectedServices = Array.from(new Set(
    (params.services || []).map(service => service.trim()).filter(Boolean),
  ));
  if (selectedServices.length > 0) {
    clauses.push(
      `LOWER(service_name) IN (${selectedServices
        .map(service => `LOWER('${escapeTreatmentSqlLiteral(service)}')`)
        .join(', ')})`,
    );
  }

  return clauses.map(clause => `        AND ${clause}`).join('\n').replace(/^        AND /, '        ');
};

export const buildTreatmentActivityCtes = (params: TreatmentActivityQueryParams) => {
  assertDateKey(params.startDate, 'startDate');
  assertDateKey(params.endDate, 'endDate');

  const clinicCode = escapeTreatmentSqlLiteral(params.clinicCode);
  const clinicId = escapeTreatmentSqlLiteral(params.clinicId);
  const timeZone = escapeTreatmentSqlLiteral(params.timeZone || TREATMENT_REPORT_TIME_ZONE);

  return `
      Clinic AS (
        SELECT COALESCE(
          (
            SELECT ANY_VALUE(ClinicID)
            FROM \`great_time.MainPaymentView\`
            WHERE LOWER(ClinicCode) = LOWER('${clinicCode}')
          ),
          '${clinicId}'
        ) AS clinic_id
      ),
      ServiceCategories AS (
        SELECT
          links.A AS service_id,
          ARRAY_AGG(
            DISTINCT NULLIF(TRIM(categories.name), '') IGNORE NULLS
            ORDER BY NULLIF(TRIM(categories.name), '')
            LIMIT 1
          )[SAFE_OFFSET(0)] AS category_name
        FROM \`great_time._ServiceToServiceType\` links
        JOIN \`great_time.service_types\` service_types ON service_types.id = links.B
        JOIN \`great_time.service_type_categories\` categories
          ON categories.id = service_types.service_type_category_id
        WHERE IFNULL(links.datastream_metadata.is_deleted, FALSE) = FALSE
        GROUP BY links.A
      ),
      CheckInPractitionerLinks AS (
        SELECT DISTINCT
          checkins.order_id AS order_pk,
          checkins.service_id,
          NULLIF(TRIM(practitioners.name), '') AS practitioner_name
        FROM \`great_time.checkin\` checkins
        CROSS JOIN Clinic clinic
        LEFT JOIN \`great_time.practitioners\` practitioners
          ON practitioners.id = checkins.practitioner_id
        WHERE checkins.clinic_id = clinic.clinic_id
          AND checkins.order_id IS NOT NULL
          AND checkins.service_id IS NOT NULL
          AND UPPER(IFNULL(checkins.status, '')) != 'CANCEL'
      ),
      OrderItemsInRange AS (
        SELECT
          o.id AS order_pk,
          o.order_id AS order_number,
          o.member_id,
          DATETIME(TIMESTAMP(o.created_at), '${timeZone}') AS activity_datetime,
          CAST(o.net_total AS FLOAT64) AS order_net_total,
          oi.id AS order_item_id,
          oi.service_id,
          oi.service_package_id,
          CAST(oi.total AS FLOAT64) AS item_total,
          NULLIF(TRIM(practitioners.name), '') AS item_practitioner_name
        FROM \`great_time.orders\` o
        CROSS JOIN Clinic c
        JOIN \`great_time.order_items\` oi ON oi.order_id = o.id
        LEFT JOIN \`great_time.practitioners\` practitioners ON practitioners.id = oi.practitioner_id
        WHERE o.clinic_id = c.clinic_id
          AND DATE(DATETIME(TIMESTAMP(o.created_at), '${timeZone}'))
            BETWEEN DATE('${params.startDate}') AND DATE('${params.endDate}')
      ),
      DirectServiceItems AS (
        SELECT DISTINCT
          activity.order_pk,
          activity.order_number,
          activity.member_id,
          activity.activity_datetime,
          activity.order_net_total,
          activity.item_total,
          activity.order_item_id,
          COALESCE(
            checkin_practitioners.practitioner_name,
            activity.item_practitioner_name,
            'Unassigned'
          ) AS practitioner_name,
          TRIM(services.name) AS service_name,
          COALESCE(categories.category_name, 'Uncategorized') AS service_category
        FROM OrderItemsInRange activity
        JOIN \`great_time.ServicesView\` services ON services.id = activity.service_id
        LEFT JOIN ServiceCategories categories ON categories.service_id = activity.service_id
        LEFT JOIN CheckInPractitionerLinks checkin_practitioners
          ON checkin_practitioners.order_pk = activity.order_pk
          AND checkin_practitioners.service_id = activity.service_id
        WHERE activity.service_id IS NOT NULL
      ),
      PackageServiceItems AS (
        SELECT DISTINCT
          activity.order_pk,
          activity.order_number,
          activity.member_id,
          activity.activity_datetime,
          activity.order_net_total,
          activity.item_total,
          activity.order_item_id,
          COALESCE(
            checkin_practitioners.practitioner_name,
            activity.item_practitioner_name,
            'Unassigned'
          ) AS practitioner_name,
          TRIM(COALESCE(NULLIF(services.name, ''), NULLIF(package_items.name, ''), packages.name)) AS service_name,
          COALESCE(categories.category_name, 'Uncategorized') AS service_category
        FROM OrderItemsInRange activity
        JOIN \`great_time.service_packages\` packages ON packages.id = activity.service_package_id
        JOIN \`great_time.service_package_items\` package_items
          ON package_items.service_package_id = activity.service_package_id
        LEFT JOIN \`great_time.ServicesView\` services ON services.id = package_items.service_id
        LEFT JOIN ServiceCategories categories ON categories.service_id = package_items.service_id
        LEFT JOIN CheckInPractitionerLinks checkin_practitioners
          ON checkin_practitioners.order_pk = activity.order_pk
          AND checkin_practitioners.service_id = package_items.service_id
        WHERE activity.service_id IS NULL
          AND activity.service_package_id IS NOT NULL
      ),
      PackageFallbackItems AS (
        SELECT DISTINCT
          activity.order_pk,
          activity.order_number,
          activity.member_id,
          activity.activity_datetime,
          activity.order_net_total,
          activity.item_total,
          activity.order_item_id,
          COALESCE(activity.item_practitioner_name, 'Unassigned') AS practitioner_name,
          TRIM(packages.name) AS service_name,
          'Package' AS service_category
        FROM OrderItemsInRange activity
        JOIN \`great_time.service_packages\` packages ON packages.id = activity.service_package_id
        WHERE activity.service_id IS NULL
          AND activity.service_package_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM \`great_time.service_package_items\` package_items
            WHERE package_items.service_package_id = activity.service_package_id
          )
      ),
      ServiceActivity AS (
        SELECT * FROM DirectServiceItems
        UNION ALL
        SELECT * FROM PackageServiceItems
        UNION ALL
        SELECT * FROM PackageFallbackItems
      ),
      ClassifiedActivity AS (
        SELECT
          *,
          CASE
            WHEN STARTS_WITH(UPPER(order_number), 'CO-')
              AND IFNULL(order_net_total, 0) = 0
              THEN 'TREATMENT_RETURN'
            WHEN IFNULL(order_net_total, 0) > 0
              AND IFNULL(item_total, 0) > 0
              THEN 'NEW_PURCHASE'
            ELSE 'OTHER'
          END AS activity_type
        FROM ServiceActivity
        WHERE service_name IS NOT NULL
          AND service_name != ''
          AND LOWER(service_name) != 'booking deposit'
      )`;
};

export const buildTopTreatmentPerformanceQuery = (params: TreatmentActivityQueryParams) => `
      WITH ${buildTreatmentActivityCtes(params)}
      SELECT
        service_name AS serviceName,
        COUNT(DISTINCT IF(activity_type = 'TREATMENT_RETURN', order_pk, NULL)) AS treatmentReturns,
        COUNT(DISTINCT IF(activity_type = 'NEW_PURCHASE', order_pk, NULL)) AS newPurchases,
        COUNT(DISTINCT IF(activity_type = 'TREATMENT_RETURN', order_pk, NULL))
          + COUNT(DISTINCT IF(activity_type = 'NEW_PURCHASE', order_pk, NULL)) AS totalActivity,
        COUNT(DISTINCT member_id) AS uniqueCustomers,
        ROUND(
          SAFE_DIVIDE(
            COUNT(DISTINCT IF(activity_type = 'TREATMENT_RETURN', order_pk, NULL)),
            COUNT(DISTINCT IF(activity_type = 'TREATMENT_RETURN', order_pk, NULL))
              + COUNT(DISTINCT IF(activity_type = 'NEW_PURCHASE', order_pk, NULL))
          ) * 100,
          1
        ) AS returnShare
      FROM ClassifiedActivity
      WHERE
${buildFilteredActivityWhere(params)}
      GROUP BY service_name
      HAVING totalActivity > 0
      ORDER BY totalActivity DESC, serviceName ASC
`;

export const buildTreatmentDetailsQuery = (params: TreatmentActivityQueryParams) => `
      WITH ${buildTreatmentActivityCtes(params)}
      SELECT
        service_name AS serviceName,
        service_category AS serviceCategory,
        EXTRACT(YEAR FROM activity_datetime) AS activityYear,
        EXTRACT(MONTH FROM activity_datetime) AS activityMonth,
        COUNT(DISTINCT IF(activity_type = 'TREATMENT_RETURN', order_pk, NULL)) AS treatmentReturns,
        COUNT(DISTINCT IF(activity_type = 'NEW_PURCHASE', order_pk, NULL)) AS newPurchases,
        COUNT(DISTINCT IF(activity_type = 'TREATMENT_RETURN', order_pk, NULL))
          + COUNT(DISTINCT IF(activity_type = 'NEW_PURCHASE', order_pk, NULL)) AS totalActivity
      FROM ClassifiedActivity
      WHERE
${buildFilteredActivityWhere(params)}
      GROUP BY service_name, service_category, activityYear, activityMonth
      HAVING totalActivity > 0
      ORDER BY serviceName, activityYear, activityMonth
`;

export const buildTreatmentFilterOptionsQuery = (clinicId: string) => {
  const safeClinicId = escapeTreatmentSqlLiteral(clinicId);

  return `
      SELECT optionType, optionValue
      FROM (
        SELECT DISTINCT
          'category' AS optionType,
          TRIM(categories.name) AS optionValue
        FROM \`great_time.service_type_categories\` categories
        WHERE categories.clinic_id = '${safeClinicId}'
          AND categories.name IS NOT NULL
          AND TRIM(categories.name) != ''

        UNION DISTINCT
        SELECT 'category', 'Uncategorized'

        UNION DISTINCT
        SELECT 'category', 'Package'

        UNION DISTINCT
        SELECT DISTINCT
          'practitioner' AS optionType,
          TRIM(practitioners.name) AS optionValue
        FROM \`great_time.practitioners\` practitioners
        WHERE practitioners.clinic_id = '${safeClinicId}'
          AND practitioners.name IS NOT NULL
          AND TRIM(practitioners.name) != ''

        UNION DISTINCT
        SELECT 'practitioner', 'Unassigned'

        UNION DISTINCT
        SELECT DISTINCT
          'service' AS optionType,
          TRIM(services.name) AS optionValue
        FROM \`great_time.ServicesView\` services
        WHERE services.clinic_id = '${safeClinicId}'
          AND services.name IS NOT NULL
          AND TRIM(services.name) != ''
          AND LOWER(TRIM(services.name)) != 'booking deposit'

        UNION DISTINCT
        SELECT DISTINCT
          'service' AS optionType,
          TRIM(packages.name) AS optionValue
        FROM \`great_time.service_packages\` packages
        WHERE packages.clinic_id = '${safeClinicId}'
          AND packages.name IS NOT NULL
          AND TRIM(packages.name) != ''
      )
      ORDER BY optionType, optionValue
  `;
};
