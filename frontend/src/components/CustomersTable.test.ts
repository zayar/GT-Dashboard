import { describe, expect, it } from 'vitest';
import { calculateAge } from './CustomersTable';

describe('calculateAge', () => {
  const today = new Date(2026, 6, 22);

  it('calculates age after the birthday has passed', () => {
    expect(calculateAge('1990-07-20', today)).toBe(36);
  });

  it('does not add a year before the birthday', () => {
    expect(calculateAge('1990-07-25', today)).toBe(35);
  });

  it('supports BigQuery wrapped date values', () => {
    expect(calculateAge({ value: '2000-01-01' }, today)).toBe(26);
  });

  it('returns null when the date of birth is missing or invalid', () => {
    expect(calculateAge('', today)).toBeNull();
    expect(calculateAge('not-a-date', today)).toBeNull();
    expect(calculateAge('2020-02-31', today)).toBeNull();
  });
});
