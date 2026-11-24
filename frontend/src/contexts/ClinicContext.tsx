import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

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
  useEffect(() => {
    if (currentId) localStorage.setItem('selectedClinicId', currentId);
    else localStorage.removeItem('selectedClinicId');
  }, [currentId]);

  const setCurrentClinic = (clinic: Clinic) => {
    if (clinic.id === currentId || !clinics.some(branch => branch.id === clinic.id)) return;
    setSelectedId(clinic.id);
    sessionStorage.removeItem('chatMessages');
  };
  return (
    <ClinicContext.Provider value={{ currentClinic, setCurrentClinic, availableClinics: clinics, loadingClinics: false }}>
      {children}
    </ClinicContext.Provider>
  );
};

export default ClinicContext;
