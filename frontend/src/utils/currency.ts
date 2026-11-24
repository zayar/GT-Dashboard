import { Clinic } from '../contexts/ClinicContext';

/**
 * Get the currency symbol for a clinic
 * @param clinic - The current clinic object
 * @returns The configured currency code, with the legacy fallback for older clinic records.
 */
export const getCurrency = (clinic: Clinic | null): string => {
  if (!clinic) return 'MMK';
  if (clinic.currency?.trim()) return clinic.currency.trim().toUpperCase();
  
  // LA BELLA CLINIC uses USD
  if (clinic.code?.toLowerCase() === 'gtlabella' || clinic.id?.toLowerCase() === 'gtlabella') {
    return 'USD';
  }
  
  // All other clinics use MMK
  return 'MMK';
};

/**
 * Format amount with the appropriate currency
 * @param amount - The amount to format
 * @param clinic - The current clinic object
 * @param options - Formatting options
 * @returns Formatted string with currency
 */
export const formatCurrency = (
  amount: number | null | undefined,
  clinic: Clinic | null,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string => {
  return formatCurrencyAmount(amount, getCurrency(clinic), { maximumFractionDigits: 0, ...options });
};

export function formatCurrencyAmount(
  amount: number | null | undefined,
  currency: string,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  const value = amount == null || Number.isNaN(amount) ? 0 : amount;
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? (Number.isInteger(value) ? 0 : 2),
  });
  return `${formatted} ${currency}`;
}
