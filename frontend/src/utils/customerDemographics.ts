const unwrapDateValue = (dateOfBirth: unknown) => (
  dateOfBirth && typeof dateOfBirth === 'object' && 'value' in dateOfBirth
    ? (dateOfBirth as { value: unknown }).value
    : dateOfBirth
);

const parseDateOfBirth = (dateOfBirth: unknown): Date | null => {
  const rawValue = String(unwrapDateValue(dateOfBirth) ?? '').trim();
  const yearFirst = rawValue.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const dayFirst = rawValue.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!yearFirst && !dayFirst) return null;

  const birthYear = Number(yearFirst?.[1] ?? dayFirst?.[3]);
  const birthMonth = Number(yearFirst?.[2] ?? dayFirst?.[2]);
  const birthDay = Number(yearFirst?.[3] ?? dayFirst?.[1]);
  const birthDate = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));

  if (
    birthDate.getUTCFullYear() !== birthYear
    || birthDate.getUTCMonth() !== birthMonth - 1
    || birthDate.getUTCDate() !== birthDay
  ) {
    return null;
  }

  return birthDate;
};

export const calculateAge = (dateOfBirth: unknown, today = new Date()): number | null => {
  const birthDate = parseDateOfBirth(dateOfBirth);
  if (!birthDate) return null;

  const birthYear = birthDate.getUTCFullYear();
  const birthMonth = birthDate.getUTCMonth() + 1;
  const birthDay = birthDate.getUTCDate();
  let age = today.getFullYear() - birthYear;
  const birthdayHasPassed = today.getMonth() + 1 > birthMonth
    || (today.getMonth() + 1 === birthMonth && today.getDate() >= birthDay);
  if (!birthdayHasPassed) age -= 1;

  return age >= 0 && age <= 130 ? age : null;
};

export const formatDateOfBirth = (dateOfBirth: unknown): string | null => {
  const birthDate = parseDateOfBirth(dateOfBirth);
  if (!birthDate) return null;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(birthDate);
};
