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

export function getReportBranches(authorized: Clinic[], currentId: string | undefined, all: boolean) {
  const current = authorized.find(branch => branch.id === currentId);
  if (!current) return [];
  const company = authorized.filter(branch => clinicCompanyKey(branch) === clinicCompanyKey(current));
  const names = new Map<string, number>();
  for (const branch of company) names.set(branch.name, (names.get(branch.name) ?? 0) + 1);
  return (all ? company : [current]).map(branch => ({
    ...branch,
    reportName: branch.name && (names.get(branch.name) ?? 0) > 1 && branch.code !== branch.name
      ? `${branch.name} · ${branch.code}` : branch.name || branch.code,
  }));
}

export type ReportClinic = Clinic & { reportName?: string };
