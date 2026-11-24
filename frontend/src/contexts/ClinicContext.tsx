import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { clinicCompanyKey, getReportBranches, type ReportClinic } from '../utils/clinicBranches';

// Clinic interface
export interface Clinic {
  id: string;
  logo: string;
  name: string;
  code: string;
  description?: string;
  companyId?: string;
  companyName?: string;
  currency?: string;
  active: number;
  pass_id?: string;
  pass_key?: string;
}

interface ClinicContextType {
  currentClinic: Clinic | null;
  setCurrentClinic: (clinic: Clinic) => void;
  availableClinics: Clinic[];
  loadingClinics: boolean;
  reportBranches: ReportClinic[];
  selectAllReportBranches: () => void;
  openBranchDetails: (clinic: Clinic) => void;
}

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export const useClinic = () => {
  const context = useContext(ClinicContext);
  if (!context) throw new Error('useClinic must be used within a ClinicProvider');
  return context;
};

interface ClinicProviderProps {
  children: ReactNode;
  clinics: Clinic[];
}

export const ClinicProvider: React.FC<ClinicProviderProps> = ({ children, clinics }) => {
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem('selectedClinicId'));
  const currentClinic = clinics.find(clinic => clinic.id === selectedId) ?? clinics[0] ?? null;
  const currentId = currentClinic?.id;
  const [allCompany, setAllCompany] = useState<string | null>(null);
  const companyKey = currentClinic ? clinicCompanyKey(currentClinic) : null;
  const reportBranches = useMemo(() => getReportBranches(clinics, currentId, allCompany === companyKey),
    [clinics, currentId, allCompany, companyKey]);

  useEffect(() => {
    if (currentId) localStorage.setItem('selectedClinicId', currentId);
    else localStorage.removeItem('selectedClinicId');
  }, [currentId]);

  const openBranchDetails = (clinic: Clinic) => {
    if (clinic.id === currentId || !clinics.some(branch => branch.id === clinic.id)) return;
    setSelectedId(clinic.id);
    sessionStorage.removeItem('chatMessages');
  };
  const setCurrentClinic = (clinic: Clinic) => {
    if (!clinics.some(branch => branch.id === clinic.id)) return;
    setAllCompany(null);
    openBranchDetails(clinic);
  };

  return (
    <ClinicContext.Provider value={{ currentClinic, setCurrentClinic, openBranchDetails, availableClinics: clinics,
      reportBranches, selectAllReportBranches: () => setAllCompany(companyKey), loadingClinics: false }}>
      {children}
    </ClinicContext.Provider>
  );
};

export default ClinicContext;
