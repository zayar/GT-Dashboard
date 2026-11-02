// The stored discount is the amount for the whole line, including quantity.
// Price differences can also be manual adjustments and are not discounts.
export function readOrderItemDiscount(metadata: string | null | undefined): number {
  if (!metadata) return 0;
  try {
    const value = JSON.parse(metadata)?.discount;
    if (typeof value !== 'number' && typeof value !== 'string') return 0;
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  } catch {
    return 0;
  }
}
