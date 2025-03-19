import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { FALLBACK_CLINICS } from '../components/ClinicSelector';

// Clinic interface
export interface Clinic {
  id: string;
  logo: string;
  name: string;
  code: string;
  description?: string;
  active: number;
}

interface ClinicContextType {
  currentClinic: Clinic | null;
  setCurrentClinic: (clinic: Clinic) => void;
  isUsingFallbackData: boolean;
  setIsUsingFallbackData: (isUsingFallback: boolean) => void;
  availableClinics: Clinic[];
  setAvailableClinics: (clinics: Clinic[]) => void;
}

// Create context with default values
const ClinicContext = createContext<ClinicContextType>({
  currentClinic: null,
  setCurrentClinic: () => {},
  isUsingFallbackData: true,
  setIsUsingFallbackData: () => {},
  availableClinics: FALLBACK_CLINICS,
  setAvailableClinics: () => {}
});

// Custom hook to use the clinic context
export const useClinic = () => useContext(ClinicContext);

interface ClinicProviderProps {
  children: ReactNode;
}

// Provider component that wraps the app
export const ClinicProvider: React.FC<ClinicProviderProps> = ({ children }) => {
  const [currentClinic, setCurrentClinic] = useState<Clinic | null>(null);
  const [isUsingFallbackData, setIsUsingFallbackData] = useState<boolean>(true);
  const [availableClinics, setAvailableClinics] = useState<Clinic[]>(FALLBACK_CLINICS);

  // Initialize with stored clinic or default on mount
  useEffect(() => {
    const storedClinicId = localStorage.getItem('selectedClinicId');
    
    if (storedClinicId) {
      const savedClinic = FALLBACK_CLINICS.find(clinic => clinic.id === storedClinicId);
      if (savedClinic) {
        setCurrentClinic(savedClinic);
      } else {
        setCurrentClinic(FALLBACK_CLINICS[0]);
        localStorage.setItem('selectedClinicId', FALLBACK_CLINICS[0].id);
      }
    } else {
      setCurrentClinic(FALLBACK_CLINICS[0]);
      localStorage.setItem('selectedClinicId', FALLBACK_CLINICS[0].id);
    }
  }, []);

  const value = {
    currentClinic,
    setCurrentClinic,
    isUsingFallbackData,
    setIsUsingFallbackData,
    availableClinics,
    setAvailableClinics
  };

  return (
    <ClinicContext.Provider value={value}>
      {children}
    </ClinicContext.Provider>
  );
};

export default ClinicContext; 