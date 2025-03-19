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

// Fallback clinic data to use when API fails
export const FALLBACK_CLINICS: Clinic[] = [
  {
    id: "GTTHEQUEEN",
    name: "The Queen",
    code: "GTTHEQUEEN",
    logo: "",
    active: 1
  },
  {
    id: "GTLEMON1",
    name: "Lemon Aesthetic",
    code: "GTLEMON1",
    logo: "",
    active: 1
  },
  {
    id: "GTPITI",
    name: "Great Time",
    code: "GTPITI",
    logo: "",
    active: 1
  },
  {
    id: "GTPURE",
    name: "Pure Wellness Clinic",
    code: "GTPURE",
    logo: "",
    active: 1
  },
  {
    id: "GTCHI",
    name: "Chi Wellness Spa & Salon",
    code: "GTCHI",
    logo: "",
    active: 1
  },
  {
    id: "GTLEMON",
    name: "Lemon Aesthetic",
    code: "GTLEMON",
    logo: "",
    active: 1
  },
  {
    id: "GTDRKO",
    name: "Dr.KO Aesthetic & Laser",
    code: "GTDRKO",
    logo: "",
    active: 1
  },
  {
    id: "GTDRMIN",
    name: "Dr.Min K-Beauty Clinic",
    code: "GTDRMIN",
    logo: "",
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
        SELECT id, logo, name, code, description, active
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
    // Start with fallback data immediately
    const storedClinicId = localStorage.getItem('selectedClinicId');
    
    if (storedClinicId) {
      const savedClinic = FALLBACK_CLINICS.find(clinic => clinic.id === storedClinicId);
      if (savedClinic) {
        setSelectedClinic(savedClinic);
        if (onClinicChange) onClinicChange(savedClinic);
      } else {
        // If stored clinic not found in fallback data, use the first one
        setSelectedClinic(FALLBACK_CLINICS[0]);
        if (onClinicChange) onClinicChange(FALLBACK_CLINICS[0]);
      }
    } else {
      // No stored clinic, use the first one
      setSelectedClinic(FALLBACK_CLINICS[0]);
      if (onClinicChange) onClinicChange(FALLBACK_CLINICS[0]);
    }
    
    // Try to fetch real data in the background without blocking UI
    fetchClinics().catch(err => {
      console.error('Background fetch failed:', err);
      // No need to do anything - we already have fallback data
    });
  }, [fetchClinics, onClinicChange]);

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
            <Avatar 
              src={selectedClinic.logo || ''} 
              alt={selectedClinic.name}
              sx={{ width: 32, height: 32, mr: 1 }}
            >
              {selectedClinic.name.charAt(0)}
            </Avatar>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="body1" noWrap component="div" sx={{ color: 'white' }}>
                {selectedClinic.name}
              </Typography>
              <Typography variant="caption" noWrap component="div" sx={{ color: 'text.secondary' }}>
                {selectedClinic.code}
              </Typography>
            </Box>
            <IconButton size="small" sx={{ color: 'text.secondary' }}>
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
              <Avatar 
                src={clinic.logo || ''} 
                alt={clinic.name}
                sx={{ width: 32, height: 32, mr: 1.5 }}
              >
                {clinic.name.charAt(0)}
              </Avatar>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {clinic.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
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