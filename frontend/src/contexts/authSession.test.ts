import { describe, expect, it } from 'vitest';
import { mapAuthorizedClinics, normalizeClinicClaims } from './authSession';

describe('normalizeClinicClaims', () => {
  it('accepts the string and object claim formats used by GreatTime tokens', () => {
    expect(normalizeClinicClaims(['clinic-1', { id: 'clinic-2' }, null, { id: 3 }])).toEqual([
      'clinic-1',
      'clinic-2',
    ]);
  });
});

describe('mapAuthorizedClinics', () => {
  it('keeps only authorized clinics and preserves pass identifiers', () => {
    const clinics = mapAuthorizedClinics(
      [
        {
          id: 'clinic-2',
          name: 'Second Clinic',
          code: 'GTSECOND',
          logo: null,
          pass: JSON.stringify({ id: 'SECOND_PASS', key: 'SECOND_KEY' }),
        },
        {
          id: 'clinic-1',
          name: 'First Clinic',
          code: 'GTFIRST',
          logo: 'first.png',
          pass: null,
        },
        {
          id: 'clinic-3',
          name: 'Not Allowed',
          code: 'GTHIDDEN',
          pass: null,
        },
      ],
      ['clinic-1', 'clinic-2'],
    );

    expect(clinics).toEqual([
      {
        id: 'clinic-1',
        code: 'GTFIRST',
        name: 'First Clinic',
        logo: 'first.png',
        active: 1,
      },
      {
        id: 'clinic-2',
        code: 'GTSECOND',
        name: 'Second Clinic',
        logo: '',
        active: 1,
        pass_id: 'SECOND_PASS',
        pass_key: 'SECOND_KEY',
      },
    ]);
  });
});
