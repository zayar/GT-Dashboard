// TO_JSON_STRING(ARRAY_AGG(...)) can return the JSON string "null" for
// an empty aggregate. Treat it as an empty list, like a native ARRAY result.
export function parseBigQueryArray<T = unknown>(value: unknown): T[] {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed : [];
}
