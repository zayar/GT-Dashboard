export async function fetchWarehouseRows<T>(query: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  });
  if (!response.ok) throw new Error(`Warehouse request failed (HTTP ${response.status}).`);
  const payload = await response.json();
  if (!payload.success || !Array.isArray(payload.data)) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'The warehouse did not return report data.');
  }
  return payload.data;
}
