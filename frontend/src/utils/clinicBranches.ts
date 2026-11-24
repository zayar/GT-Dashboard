import type { Clinic } from '../contexts/ClinicContext';

interface CompanyBranches {
  key: string;
  name: string;
  branches: Clinic[];
}

export function clinicCompanyKey(clinic: Clinic) {
  return clinic.companyId ? `company:${clinic.companyId}` : `clinic:${clinic.id}`;
}

export function groupClinicBranches(clinics: Clinic[]) {
  const companies = new Map<string, CompanyBranches>();
  for (const clinic of clinics) {
    const key = clinicCompanyKey(clinic);
    const company = companies.get(key);
    if (company) company.branches.push(clinic);
    else companies.set(key, { key, name: clinic.companyName || clinic.name, branches: [clinic] });
  }
  return [...companies.values()].sort((a, b) => a.name.localeCompare(b.name));
}
