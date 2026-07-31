import { describe, expect, it } from 'vitest';
import { calculateAge, formatDateOfBirth } from './customerDemographics';

describe('customer demographics', () => {
  const today = new Date(2026, 6, 22);

  it('formats and calculates a valid date of birth', () => {
    expect(formatDateOfBirth('1990-07-20')).toBe('20 Jul 1990');
    expect(calculateAge('1990-07-20', today)).toBe(36);
  });

  it('supports wrapped BigQuery values', () => {
    expect(formatDateOfBirth({ value: '2000/01/02' })).toBe('02 Jan 2000');
    expect(calculateAge({ value: '2000/01/02' }, today)).toBe(26);
  });

  it('supports day-first dates used by legacy customer records', () => {
    expect(formatDateOfBirth('30/11/1964')).toBe('30 Nov 1964');
    expect(calculateAge('30/11/1964', today)).toBe(61);
  });

  it('returns null for missing, invalid, or future dates', () => {
    expect(formatDateOfBirth('')).toBeNull();
    expect(formatDateOfBirth('2020-02-31')).toBeNull();
    expect(calculateAge('not-a-date', today)).toBeNull();
    expect(calculateAge('2030-01-01', today)).toBeNull();
  });
});
