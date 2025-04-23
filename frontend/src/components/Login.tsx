import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useClinic } from '../contexts/ClinicContext';

interface LoginProps {
  onLogin: (status: boolean) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { reload } = useClinic();

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      // onAuthStateChanged in AuthProvider will handle setting currentUser
      reload();
      onLogin(true); // Update App's state

    } catch (err: any) {
      setError(err.message || 'Failed to log in.');
      console.error("Firebase Login Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        bgcolor: '#0f1628',
        backgroundImage: 'radial-gradient(circle at center, #1a2235 0%, #0f1628 100%)',
      }}
    >
      <Box
        sx={{
          p: 5,
          bgcolor: 'rgba(30, 41, 59, 0.8)',
          borderRadius: 4,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          width: '100%',
          maxWidth: '450px',
          textAlign: 'center',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center' }}>
          <img src="/gtlogo.svg" alt="GT Logo" width="120" />
        </Box>
        
        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {error}
          </Alert>
        )}
        
        <TextField
          placeholder="Name"
          variant="outlined"
          fullWidth
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyPress={handleKeyPress}
          sx={{
            mb: 3,
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              bgcolor: 'rgba(15, 23, 42, 0.3)',
              color: '#f3f4f6',
              '& fieldset': {
                borderColor: 'rgba(148, 163, 184, 0.2)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(148, 163, 184, 0.4)',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#94a3b8',
              },
            },
            '& .MuiInputBase-input': {
              padding: '16px',
            },
          }}
          InputLabelProps={{
            shrink: false,
          }}
          InputProps={{
            style: { color: '#f3f4f6' },
          }}
        />
        
        <TextField
          placeholder="Password"
          type="password"
          variant="outlined"
          fullWidth
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyPress={handleKeyPress}
          sx={{
            mb: 4,
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              bgcolor: 'rgba(15, 23, 42, 0.3)',
              color: '#f3f4f6',
              '& fieldset': {
                borderColor: 'rgba(148, 163, 184, 0.2)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(148, 163, 184, 0.4)',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#94a3b8',
              },
            },
            '& .MuiInputBase-input': {
              padding: '16px',
            },
          }}
          InputLabelProps={{
            shrink: false,
          }}
          InputProps={{
            style: { color: '#f3f4f6' },
          }}
        />
        
        <Button
          variant="contained"
          fullWidth
          onClick={handleLogin}
          disabled={loading}
          sx={{
            py: 1.8,
            fontSize: '1rem',
            fontWeight: 'bold',
            bgcolor: '#0f1628',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            borderRadius: 2,
            letterSpacing: '1px',
            '&:hover': {
              bgcolor: '#1a2235',
            },
          }}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : 'LOGIN'}
        </Button>
      </Box>
    </Box>
  );
};

export default Login; 