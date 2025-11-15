import { Clinic } from '../contexts/ClinicContext';

/**
 * Get the currency symbol for a clinic
 * @param clinic - The current clinic object
 * @returns Currency symbol (USD for LA BELLA, MMK for others)
 */
export const getCurrency = (clinic: Clinic | null): string => {
  if (!clinic) return 'MMK';
  
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
  if (amount === null || amount === undefined || isNaN(amount)) {
    return `0 ${getCurrency(clinic)}`;
  }

  const currency = getCurrency(clinic);
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 0
  });

  return `${formatted} ${currency}`;
};

