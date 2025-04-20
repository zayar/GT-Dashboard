import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

// Clinic interface
export interface Clinic {
  id: string;
  logo: string;
  name: string;
  code: string;
  description?: string;
  active: number;
  pass_id?: string;
  pass_key?: string;
}

// Define FALLBACK_CLINICS
const FALLBACK_CLINICS: Clinic[] = [
  // {
  //   id: "GTTHEQUEEN",
  //   name: "The Queen",
  //   code: "GTTHEQUEEN",
  //   logo: "/clinic-logos/queen-logo.png",
  //   active: 1,
  //   pass_id: "GTTHEQUEEN_PASS",
  //   pass_key: "GTTHEQUEEN_KEY"
  // },
];

interface ClinicContextType {
  currentClinic: Clinic | null;
  setCurrentClinic: (clinic: Clinic) => void;
  isUsingFallbackData: boolean;
  setIsUsingFallbackData: (isUsingFallback: boolean) => void;
  availableClinics: Clinic[];
  setAvailableClinics: (clinics: Clinic[]) => void;
  loadingClinics: boolean;
  reload: () => void;
}

// Create context with undefined to enforce provider usage
const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

// Custom hook to use the clinic context
export const useClinic = () => {
  const context = useContext(ClinicContext);
  if (!context) {
    throw new Error('useClinic must be used within a ClinicProvider');
  }
  return context;
};

interface ClinicProviderProps {
  children: ReactNode;
}

export const ClinicProvider: React.FC<ClinicProviderProps> = ({ children }) => {
  const [currentClinic, setCurrentClinic] = useState<Clinic | null>(null);
  const [isUsingFallbackData, setIsUsingFallbackData] = useState<boolean>(true);
  const [availableClinics, setAvailableClinics] = useState<Clinic[]>([]);
  const [loadingClinics, setLoadingClinics] = useState<boolean>(true);


  const load = () => {
    const storedClinics = localStorage.getItem('availableClinics');
    const storedClinicId = localStorage.getItem('selectedClinicId');
    if (storedClinics) {
      try {
        const parsedClinics: Clinic[] = JSON.parse(storedClinics);
        setAvailableClinics(parsedClinics);
        setIsUsingFallbackData(false);
        if (storedClinicId) {
          const selectedClinic = parsedClinics.find(c => c.id === storedClinicId);
          if (selectedClinic) {
            setCurrentClinic(selectedClinic);
          }
        }
      } catch (error) {
        console.error('Failed to parse stored clinics:', error);
        setAvailableClinics(FALLBACK_CLINICS);
        setIsUsingFallbackData(true);
      }
    } else {
      setAvailableClinics(FALLBACK_CLINICS);
      setIsUsingFallbackData(true);
    }
    setLoadingClinics(false);
  }

  // Initialize from localStorage on mount
  useEffect(() => {
    load();
  }, []);

  // Override setCurrentClinic to update localStorage
  const handleSetCurrentClinic = (clinic: Clinic) => {
    setCurrentClinic(clinic);
    localStorage.setItem('selectedClinicId', clinic.id);
  };

  // Override setAvailableClinics to update localStorage
  const handleSetAvailableClinics = (clinics: Clinic[]) => {
    setAvailableClinics(clinics);
    localStorage.setItem('availableClinics', JSON.stringify(clinics));
  };

  const reload = () => {
    load();
  }
  const value: ClinicContextType = {
    currentClinic,
    setCurrentClinic: handleSetCurrentClinic,
    isUsingFallbackData,
    setIsUsingFallbackData,
    availableClinics,
    setAvailableClinics: handleSetAvailableClinics,
    loadingClinics,
    reload,
  };

  return (
    <ClinicContext.Provider value={value}>
      {children}
    </ClinicContext.Provider>
  );
};

export default ClinicContext;