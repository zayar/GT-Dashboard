import type { Clinic } from './ClinicContext';

export interface ApiClinic {
  id: string;
  logo?: string | null;
  name: string;
  code: string;
  pass?: string | null;
}

export function normalizeClinicClaims(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      return entry.trim() ? [entry] : [];
    }

    if (entry && typeof entry === 'object' && 'id' in entry) {
      const id = (entry as { id?: unknown }).id;
      return typeof id === 'string' && id.trim() ? [id] : [];
    }

    return [];
  });
}

function parsePass(value: string | null | undefined) {
  if (!value) {
    return {};
  }

  try {
    const pass = JSON.parse(value) as { id?: unknown; key?: unknown };
    return {
      pass_id: typeof pass.id === 'string' ? pass.id : undefined,
      pass_key: typeof pass.key === 'string' ? pass.key : undefined,
    };
  } catch {
    return {};
  }
}

export function mapAuthorizedClinics(clinics: ApiClinic[], allowedClinicIds: string[]): Clinic[] {
  const allowedIds = new Set(allowedClinicIds);
  const clinicsById = new Map<string, Clinic>();

  clinics.forEach((clinic) => {
    if (!allowedIds.has(clinic.id) || !clinic.code.trim()) {
      return;
    }

    clinicsById.set(clinic.id, {
      id: clinic.id,
      code: clinic.code,
      name: clinic.name,
      logo: clinic.logo ?? '',
      active: 1,
      ...parsePass(clinic.pass),
    });
  });

  return [...clinicsById.values()].sort((left, right) => left.name.localeCompare(right.name));
}
