import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { Avatar, Box, CircularProgress, IconButton, Menu, MenuItem, Typography } from '@mui/material';
import React, { useState } from 'react';
import { useClinic } from '../contexts/ClinicContext'; // Import useClinic

// Interface for clinic data (can be shared or kept here)
export interface Clinic {
  id: string;
  logo: string;
  name: string;
  code: string;
  description?: string;
  active: number;
  pass_id?: string;
  pass_key?: string;
  pass?: string | Record<string, any>; // Keep pass for potential legacy use in context
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

// Fallback clinic data can be removed if not used elsewhere, or kept for reference
// export const FALLBACK_CLINICS: Clinic[] = [ ... ]; 

interface ClinicSelectorProps {
  onClinicChange?: (clinic: Clinic) => void;
}

const ClinicSelector: React.FC<ClinicSelectorProps> = ({ onClinicChange }) => {
  // Get state from context
  const {
    availableClinics, 
    currentClinic,
    setCurrentClinic,
    loadingClinics,
    isUsingFallbackData 
  } = useClinic();
  
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Remove internal state for clinics, loading, error, usingFallback
  // const [clinics, setClinics] = useState<Clinic[]>(FALLBACK_CLINICS);
  // const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  // const [loading, setLoading] = useState<boolean>(false);
  // const [error, setError] = useState<string | null>(null);
  // const [usingFallback, setUsingFallback] = useState<boolean>(false);

  // Remove internal fetchClinics function
  // const fetchClinics = useCallback(async () => { ... }, []);

  // Remove useEffect that called internal fetchClinics
  // useEffect(() => { ... }, []);

  // Remove useEffect that updated internal selectedClinic based on internal clinics state
  // useEffect(() => { ... }, [clinics]);
  
  // Update local storage and context when clinic changes (use provided setCurrentClinic)
  const handleClinicSelect = (clinic: Clinic) => {
    if (currentClinic?.id !== clinic.id) {
        setCurrentClinic(clinic); // Update context
        localStorage.setItem('selectedClinicId', clinic.id);
        if (onClinicChange) onClinicChange(clinic);
        console.log('Clinic changed via selector:', clinic.name);
    }
    handleClose();
  };

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  if (loadingClinics) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', p: 1 }}>
        <CircularProgress size={20} sx={{ mr: 1 }} />
        <Typography variant="body2" color="text.secondary">Loading clinics...</Typography>
      </Box>
    );
  }

  if (!currentClinic && !loadingClinics && availableClinics.length === 0) {
    return (
       <Box sx={{ display: 'flex', alignItems: 'center', p: 1 }}>
        <Typography variant="body2" color="error.main">No clinics available for this user.</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      p: 1, 
      cursor: availableClinics.length > 0 ? 'pointer' : 'default', // Only allow click if clinics exist
      borderRadius: 1,
      '&:hover': { bgcolor: availableClinics.length > 0 ? 'rgba(255, 255, 255, 0.08)' : 'transparent' }
    }}>
      <Box onClick={availableClinics.length > 0 ? handleClick : undefined} sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        {currentClinic ? (
          <>
            {/* TODO: ClinicAvatar needs to be defined or imported if removed from here */}
            {/* <ClinicAvatar clinic={currentClinic} mr={1} /> */}
             <Avatar sx={{ width: 32, height: 32, mr: 1, bgcolor: 'secondary.main' }}>
               {currentClinic.name?.charAt(0)?.toUpperCase() || 'C'}
             </Avatar>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="body1" noWrap component="div" sx={{ color: 'white' }}>
                {currentClinic.name}
                 {isUsingFallbackData && <Typography variant="caption" color="warning.light" sx={{ml: 1}}>(Local)</Typography>}
              </Typography>
              <Typography variant="caption" noWrap component="div" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                {currentClinic.code}
              </Typography>
            </Box>
            {availableClinics.length > 1 && ( // Only show dropdown if more than one clinic
                <IconButton size="small" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                  <ArrowDropDownIcon />
                </IconButton>
            )}
          </>
        ) : (
           <Typography variant="body2" color="text.secondary">No Clinic Selected</Typography>
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
        {isUsingFallbackData && (
          <Box sx={{ px: 2, py: 1, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Typography variant="caption" color="warning.main" sx={{ fontSize: '0.7rem' }}>
              Using local data. API connection may have failed.
            </Typography>
          </Box>
        )}
        
        {availableClinics.map((clinic) => (
          <MenuItem 
            key={clinic.id} 
            onClick={() => handleClinicSelect(clinic)}
            selected={currentClinic?.id === clinic.id}
            sx={{
              borderLeft: currentClinic?.id === clinic.id ? '3px solid #3f83f8' : '3px solid transparent',
              bgcolor: currentClinic?.id === clinic.id ? 'rgba(63, 131, 248, 0.1)' : 'transparent',
              '&:hover': {
                bgcolor: currentClinic?.id === clinic.id ? 'rgba(63, 131, 248, 0.2)' : 'rgba(255, 255, 255, 0.08)'
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
               {/* TODO: ClinicAvatar needs to be defined or imported if removed from here */}
               {/* <ClinicAvatar clinic={clinic} mr={1.5} /> */}
                <Avatar sx={{ width: 32, height: 32, mr: 1.5, bgcolor: 'secondary.dark' }}>
                   {clinic.name?.charAt(0)?.toUpperCase() || 'C'}
                 </Avatar>
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