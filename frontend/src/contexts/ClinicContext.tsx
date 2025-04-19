import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext'; // Import useAuth
// Use axios directly, assuming interceptors are configured globally or applied elsewhere
import axios from 'axios'; 
import { auth } from '../config/firebase'; // Needed for getIdToken

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

// Define FALLBACK_CLINICS directly here
const FALLBACK_CLINICS: Clinic[] = [
  {
    id: "GTTHEQUEEN",
    name: "The Queen",
    code: "GTTHEQUEEN",
    logo: "/clinic-logos/queen-logo.png",
    active: 1,
    pass_id: "GTTHEQUEEN_PASS",
    pass_key: "GTTHEQUEEN_KEY"
  },
  {
    id: "GTLEMON1",
    name: "Lemon Aesthetic",
    code: "GTLEMON1",
    logo: "/clinic-logos/lemon-logo.png",
    active: 1,
    pass_id: "GTLEMON1_PASS",
    pass_key: "GTLEMON1_KEY"
  },
  {
    id: "GTPITI",
    name: "Great Time",
    code: "GTPITI",
    logo: "/clinic-logos/greattime-logo.png",
    active: 1,
    pass_id: "GTPITI_PASS",
    pass_key: "GTPITI_KEY"
  },
  {
    id: "GTPURE",
    name: "Pure Wellness Clinic",
    code: "GTPURE",
    logo: "/clinic-logos/pure-logo.png",
    active: 1,
    pass_id: "GTPURE_PASS",
    pass_key: "GTPURE_KEY"
  },
  {
    id: "GTCHI",
    name: "Chi Wellness Spa & Salon",
    code: "GTCHI",
    logo: "/clinic-logos/chi-logo.png",
    active: 1,
    pass_id: "GTCHI_PASS",
    pass_key: "GTCHI_KEY"
  },
  {
    id: "GTLEMON",
    name: "Lemon Aesthetic",
    code: "GTLEMON",
    logo: "/clinic-logos/lemon-logo.png",
    active: 1,
    pass_id: "GTLEMON_PASS",
    pass_key: "GTLEMON_KEY"
  },
  {
    id: "GTDRKO",
    name: "Dr.KO Aesthetic & Laser",
    code: "GTDRKO",
    logo: "/clinic-logos/drko-logo.png",
    active: 1,
    pass_id: "GTDRKO_PASS",
    pass_key: "GTDRKO_KEY"
  },
  {
    id: "GTDRMIN",
    name: "Dr.Min K-Beauty Clinic",
    code: "GTDRMIN",
    logo: "/clinic-logos/drmin-logo.png",
    active: 1,
    pass_id: "GTDRMIN_PASS",
    pass_key: "GTDRMIN_KEY"
  }
];

interface ClinicContextType {
  currentClinic: Clinic | null;
  setCurrentClinic: (clinic: Clinic) => void;
  isUsingFallbackData: boolean;
  setIsUsingFallbackData: (isUsingFallback: boolean) => void;
  availableClinics: Clinic[];
  setAvailableClinics: (clinics: Clinic[]) => void;
  loadingClinics: boolean; // Add loading state
}

// Create context with default values
const ClinicContext = createContext<ClinicContextType>({
  currentClinic: null,
  setCurrentClinic: () => {},
  isUsingFallbackData: true,
  setIsUsingFallbackData: () => {},
  availableClinics: FALLBACK_CLINICS, // Start with fallback
  setAvailableClinics: () => {},
  loadingClinics: true, // Start loading
});

// Custom hook to use the clinic context
export const useClinic = () => useContext(ClinicContext);

interface ClinicProviderProps {
  children: ReactNode;
}

// Provider component that wraps the app
export const ClinicProvider: React.FC<ClinicProviderProps> = ({ children }) => {
  const { currentUser } = useAuth(); // Get current user
  const [currentClinic, setCurrentClinic] = useState<Clinic | null>(null);
  const [isUsingFallbackData, setIsUsingFallbackData] = useState<boolean>(true);
  const [availableClinics, setAvailableClinics] = useState<Clinic[]>(FALLBACK_CLINICS); // Initialize with fallback
  const [loadingClinics, setLoadingClinics] = useState<boolean>(true);

  // Fetch allowed clinics when user logs in or changes
  useEffect(() => {
    const fetchUserClinics = async () => {
      if (!currentUser) {
        console.log('No current user, clearing clinics.');
        setAvailableClinics([]); // Clear clinics if logged out
        setCurrentClinic(null);
        setLoadingClinics(false);
        setIsUsingFallbackData(true); // No user means no API data
        localStorage.removeItem('selectedClinicId'); // Clear selection on logout
        return;
      }

      console.log('Current user found, fetching clinics...');
      setLoadingClinics(true);
      setIsUsingFallbackData(false); // Assume we'll get real data
      try {
        // Get the Firebase ID token
        const token = await currentUser.getIdToken();
        
        // Use axios directly, passing the token in the header
        const response = await axios.get('/api/user-clinics', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        console.log('Fetched /api/user-clinics response:', response);

        if (response.data.success && response.data.data && response.data.data.length > 0) {
          console.log('Successfully fetched clinics:', response.data.data);
          setAvailableClinics(response.data.data);
          setIsUsingFallbackData(false);

          // Set current clinic based on available ones and local storage
          const storedClinicId = localStorage.getItem('selectedClinicId');
          const allowedClinic = response.data.data.find((c: Clinic) => c.id === storedClinicId);

          if (allowedClinic) {
            console.log('Setting current clinic from allowed & stored:', allowedClinic.name);
            setCurrentClinic(allowedClinic);
          } else {
            // Default to the first available clinic if stored one is invalid/not allowed
            console.log('Setting current clinic to first allowed:', response.data.data[0].name);
            setCurrentClinic(response.data.data[0]);
            localStorage.setItem('selectedClinicId', response.data.data[0].id);
          }
        } else {
          // Handle cases where API call succeeds but no clinics are returned or data format is wrong
          console.warn('No clinics assigned or API error structure. Clearing clinics.');
          setAvailableClinics([]);
          setCurrentClinic(null);
          setIsUsingFallbackData(true); // Treat as fallback if no data
          localStorage.removeItem('selectedClinicId');
          if (!response.data.success) {
            console.error("API Error fetching clinics:", response.data.error);
          }
        }
      } catch (error) {
        console.error('Failed to fetch user clinics via API:', error);
        console.log('Reverting to fallback clinics.');
        setAvailableClinics(FALLBACK_CLINICS);
        setIsUsingFallbackData(true);
        // Attempt to set current clinic from fallback
        const storedClinicId = localStorage.getItem('selectedClinicId');
        const fallbackClinic = FALLBACK_CLINICS.find(c => c.id === storedClinicId);
        if (fallbackClinic) {
          console.log('Setting current clinic from fallback & stored:', fallbackClinic.name);
          setCurrentClinic(fallbackClinic);
        } else if (FALLBACK_CLINICS.length > 0) {
          console.log('Setting current clinic to first fallback:', FALLBACK_CLINICS[0].name);
          setCurrentClinic(FALLBACK_CLINICS[0]);
          localStorage.setItem('selectedClinicId', FALLBACK_CLINICS[0].id);
        } else {
          console.log('No fallback clinics available either.');
          setCurrentClinic(null);
          localStorage.removeItem('selectedClinicId');
        }
      } finally {
        setLoadingClinics(false);
      }
    };

    fetchUserClinics();
  }, [currentUser]); // Re-fetch when user changes

  const value = {
    currentClinic,
    setCurrentClinic,
    isUsingFallbackData,
    setIsUsingFallbackData,
    availableClinics,
    setAvailableClinics,
    loadingClinics, // Provide loading state
  };

  return (
    <ClinicContext.Provider value={value}>
      {children}
    </ClinicContext.Provider>
  );
};

export default ClinicContext; 