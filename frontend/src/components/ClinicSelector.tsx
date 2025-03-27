import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Avatar, Menu, MenuItem, IconButton } from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

// Interface for clinic data
interface Clinic {
  id: string;
  logo: string;
  name: string;
  code: string;
  description?: string;
  active: number;
}

// Generate a consistent color based on clinic ID
const generateColorFromString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Use a limited palette of good-looking colors
  const colors = [
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#10b981', // emerald
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#f43f5e', // rose
    '#6366f1', // indigo
    '#14b8a6', // teal
    '#d946ef', // fuchsia
    '#84cc16', // lime
  ];
  
  return colors[Math.abs(hash) % colors.length];
};

// Get specific logo based on clinic ID
const getClinicLogo = (clinicId: string) => {
  // Map clinicIds to their Firebase Storage URLs
  const logoMap: Record<string, string> = {
    "GTSPACEPARTYK": "https://firebasestorage.googleapis.com/v0/b/aesthetics-441d8.appspot.com/o/clinic%2FGTSPACEPARTYK-partyk_black.png?alt=media&token=e13e0146-9cef-4c10-a77a-6e9ce1e26c06",
    // Add other clinic logos here when available
    "GTTHEQUEEN": "https://firebasestorage.googleapis.com/v0/b/aesthetics-441d8.appspot.com/o/clinic%2FGTTHEQUEEN-queen_logo.png?alt=media",
    "GTLEMON1": "https://firebasestorage.googleapis.com/v0/b/aesthetics-441d8.appspot.com/o/clinic%2FGTLEMON1-lemon_logo.png?alt=media",
    "GTPITI": "https://firebasestorage.googleapis.com/v0/b/aesthetics-441d8.appspot.com/o/clinic%2FGTPITI-greattime_logo.png?alt=media",
    "GTPURE": "https://firebasestorage.googleapis.com/v0/b/aesthetics-441d8.appspot.com/o/clinic%2FGTPURE-pure_logo.png?alt=media",
    "GTCHI": "https://firebasestorage.googleapis.com/v0/b/aesthetics-441d8.appspot.com/o/clinic%2FGTCHI-chi_logo.png?alt=media",
    "GTLEMON": "https://firebasestorage.googleapis.com/v0/b/aesthetics-441d8.appspot.com/o/clinic%2FGTLEMON-lemon_logo.png?alt=media",
    "GTDRKO": "https://firebasestorage.googleapis.com/v0/b/aesthetics-441d8.appspot.com/o/clinic%2FGTDRKO-drko_logo.png?alt=media",
    "GTDRMIN": "https://firebasestorage.googleapis.com/v0/b/aesthetics-441d8.appspot.com/o/clinic%2FGTDRMIN-drmin_logo.png?alt=media",
  };

  // Return the Firebase URL if it exists, otherwise use the logo from clinic.logo field
  return logoMap[clinicId] || "/gtlogo.svg";
};

// Custom clinic avatar component that handles fallbacks gracefully
const ClinicAvatar = ({ clinic, size = 32, mr = 1 }: { clinic: Clinic, size?: number, mr?: number }) => {
  const [useLetterFallback, setUseLetterFallback] = useState(false);
  
  // If clinic.logo is a full URL (starts with http/https), use it directly
  // Otherwise, use our getClinicLogo function as a fallback
  const logoUrl = clinic.logo && (clinic.logo.startsWith('http://') || clinic.logo.startsWith('https://'))
    ? clinic.logo 
    : getClinicLogo(clinic.id);
    
  const bgColor = generateColorFromString(clinic.id);
  
  const handleImageError = () => {
    console.log(`Image load error for clinic: ${clinic.name}, URL: ${logoUrl}`);
    setUseLetterFallback(true);
  };
  
  return (
    <Box 
      sx={{ 
        width: size, 
        height: size, 
        mr,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        overflow: 'hidden',
        backgroundColor: useLetterFallback ? bgColor : 'transparent',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}
    >
      {useLetterFallback ? (
        <Typography 
          sx={{ 
            color: 'white', 
            fontSize: size * 0.5,
            fontWeight: 'bold',
            textTransform: 'uppercase'
          }}
        >
          {clinic.name.charAt(0)}
        </Typography>
      ) : (
        <img 
          src={logoUrl} 
          alt={clinic.name}
          style={{ 
            width: '80%', 
            height: '80%', 
            objectFit: 'contain',
            padding: '2px'
          }} 
          onError={handleImageError}
        />
      )}
    </Box>
  );
};

// Fallback clinic data to use when API fails
export const FALLBACK_CLINICS: Clinic[] = [
  {
    id: "GTTHEQUEEN",
    name: "The Queen",
    code: "GTTHEQUEEN",
    logo: "/clinic-logos/queen-logo.png",
    active: 1
  },
  {
    id: "GTLEMON1",
    name: "Lemon Aesthetic",
    code: "GTLEMON1",
    logo: "/clinic-logos/lemon-logo.png",
    active: 1
  },
  {
    id: "GTPITI",
    name: "Great Time",
    code: "GTPITI",
    logo: "/clinic-logos/greattime-logo.png",
    active: 1
  },
  {
    id: "GTPURE",
    name: "Pure Wellness Clinic",
    code: "GTPURE",
    logo: "/clinic-logos/pure-logo.png",
    active: 1
  },
  {
    id: "GTCHI",
    name: "Chi Wellness Spa & Salon",
    code: "GTCHI",
    logo: "/clinic-logos/chi-logo.png",
    active: 1
  },
  {
    id: "GTLEMON",
    name: "Lemon Aesthetic",
    code: "GTLEMON",
    logo: "/clinic-logos/lemon-logo.png",
    active: 1
  },
  {
    id: "GTDRKO",
    name: "Dr.KO Aesthetic & Laser",
    code: "GTDRKO",
    logo: "/clinic-logos/drko-logo.png",
    active: 1
  },
  {
    id: "GTDRMIN",
    name: "Dr.Min K-Beauty Clinic",
    code: "GTDRMIN",
    logo: "/clinic-logos/drmin-logo.png",
    active: 1
  }
];

interface ClinicSelectorProps {
  onClinicChange?: (clinic: Clinic) => void;
}

const ClinicSelector: React.FC<ClinicSelectorProps> = ({ onClinicChange }) => {
  const [clinics, setClinics] = useState<Clinic[]>(FALLBACK_CLINICS);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [usingFallback, setUsingFallback] = useState<boolean>(false);

  // Define fetchClinics with useCallback so it can be reused
  const fetchClinics = useCallback(async () => {
    // Don't set loading to true immediately - we'll use fallback data first
    // and try to load real data in the background
    
    try {
      // Set up a timeout to abort the fetch if it takes too long
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        throw new Error("Request timed out after 5 seconds");
      }, 5000);

      const query = `
        SELECT id, logo, name,code, description, active
        FROM great_time.clinics 
        WHERE active = 1
        ORDER BY name ASC
      `;
      
      console.log('Fetching clinics with query:', query);
      
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('API response error:', response.status, errorData);
        throw new Error(`Failed to fetch clinics: ${response.status} ${errorData ? JSON.stringify(errorData) : ''}`);
      }
      
      const data = await response.json();
      console.log('Clinics API response:', data);
      
      // Handle different response formats based on backend implementation
      let clinicsData = [];
      if (data && data.success && data.data && Array.isArray(data.data)) {
        // This matches the response format we saw in the backend code
        clinicsData = data.data;
      } else if (data && data.rows && Array.isArray(data.rows)) {
        clinicsData = data.rows;
      } else if (data && Array.isArray(data)) {
        clinicsData = data;
      } else {
        console.error('Invalid API response format:', data);
        throw new Error('Invalid API response format');
      }
      
      if (clinicsData.length === 0) {
        console.warn('No clinics found in API response, using fallback data');
        setUsingFallback(true);
        // We're already using fallback data, so no need to setClinics again
      } else {
        console.log('Found clinics from API:', clinicsData.length);
        // Log each clinic to see logo URLs
        clinicsData.forEach((clinic: Clinic) => {
          console.log(`Clinic: ${clinic.name}, ID: ${clinic.id}, Logo: ${clinic.logo || 'None'}`);
        });
        setClinics(clinicsData);
        setUsingFallback(false);
      }
      
      setError(null);
    } catch (err) {
      console.error('Error fetching clinics:', err);
      // We're already using fallback data, so just show a warning, not an error
      console.warn('Using fallback clinic data due to API error');
      setUsingFallback(true);
      // No need to show error to user since we're using fallback data
    } finally {
      setLoading(false);
    }
  }, [onClinicChange]);

  // Initialize component with selected clinic
  useEffect(() => {
    const storedClinicId = localStorage.getItem('selectedClinicId');
    
    if (storedClinicId) {
      const savedClinic = clinics.find(clinic => clinic.id === storedClinicId);
      if (savedClinic) {
        setSelectedClinic(savedClinic);
        if (onClinicChange) onClinicChange(savedClinic);
      } else {
        setSelectedClinic(FALLBACK_CLINICS[0]);
        if (onClinicChange) onClinicChange(FALLBACK_CLINICS[0]);
        localStorage.setItem('selectedClinicId', FALLBACK_CLINICS[0].id);
      }
    } else {
      setSelectedClinic(FALLBACK_CLINICS[0]);
      if (onClinicChange) onClinicChange(FALLBACK_CLINICS[0]);
      localStorage.setItem('selectedClinicId', FALLBACK_CLINICS[0].id);
    }
    
    fetchClinics().catch(err => {
      console.error('Background fetch failed:', err);
    });
  }, []);

  // Update selected clinic when clinics data changes
  useEffect(() => {
    const storedClinicId = localStorage.getItem('selectedClinicId');
    if (storedClinicId && clinics.length > 0) {
      const savedClinic = clinics.find(clinic => clinic.id === storedClinicId);
      if (savedClinic) {
        setSelectedClinic(savedClinic);
        if (onClinicChange) onClinicChange(savedClinic);
      }
    }
  }, [clinics]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleClinicSelect = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    localStorage.setItem('selectedClinicId', clinic.id);
    if (onClinicChange) onClinicChange(clinic);
    handleClose();
  };

  // Component is never in a loading state for the user now
  if (loading && !selectedClinic) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', p: 1 }}>
        <Typography variant="body2" color="text.secondary">Loading clinics...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      p: 1, 
      cursor: 'pointer',
      borderRadius: 1,
      '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' }
    }}>
      <Box onClick={handleClick} sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        {selectedClinic && (
          <>
            <ClinicAvatar clinic={selectedClinic} mr={1} />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="body1" noWrap component="div" sx={{ color: 'white' }}>
                {selectedClinic.name}
              </Typography>
              <Typography variant="caption" noWrap component="div" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                {selectedClinic.code}
              </Typography>
            </Box>
            <IconButton size="small" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              <ArrowDropDownIcon />
            </IconButton>
          </>
        )}
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        PaperProps={{
          sx: {
            maxHeight: 300,
            width: 280,
            bgcolor: '#1a2235',
            color: 'white',
            '& .MuiMenuItem-root': {
              py: 1.5
            }
          }
        }}
      >
        {usingFallback && (
          <Box sx={{ px: 2, py: 1, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Typography variant="caption" color="warning.main" sx={{ fontSize: '0.7rem' }}>
              Using local data. API connection failed.
            </Typography>
          </Box>
        )}
        
        {clinics.map((clinic) => (
          <MenuItem 
            key={clinic.id} 
            onClick={() => handleClinicSelect(clinic)}
            selected={selectedClinic?.id === clinic.id}
            sx={{
              borderLeft: selectedClinic?.id === clinic.id ? '3px solid #3f83f8' : '3px solid transparent',
              bgcolor: selectedClinic?.id === clinic.id ? 'rgba(63, 131, 248, 0.1)' : 'transparent',
              '&:hover': {
                bgcolor: selectedClinic?.id === clinic.id ? 'rgba(63, 131, 248, 0.2)' : 'rgba(255, 255, 255, 0.08)'
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <ClinicAvatar clinic={clinic} mr={1.5} />
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ color: 'white' }}>
                  {clinic.name}
                </Typography>
                <Typography variant="caption" noWrap sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                  {clinic.code}
                </Typography>
              </Box>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default ClinicSelector; 