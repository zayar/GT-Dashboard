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

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        bgcolor: '#101729'
      }}
    >
      <Box
        sx={{
          p: 4,
          bgcolor: '#1a2235',
          borderRadius: 2,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          width: '100%',
          maxWidth: '400px',
          textAlign: 'center'
        }}
      >
        <Typography variant="h4" component="h1" sx={{ mb: 3, color: '#f3f4f6' }}>
          Admin Login
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          label="Email"
          variant="outlined"
          fullWidth
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ mb: 2, input: { color: '#f3f4f6' }, label: { color: '#9ca3af' } }}
          InputLabelProps={{
            style: { color: '#9ca3af' },
          }}
        />
        <TextField
          label="Password"
          type="password"
          variant="outlined"
          fullWidth
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          sx={{ mb: 3, input: { color: '#f3f4f6' }, label: { color: '#9ca3af' } }}
          InputLabelProps={{
            style: { color: '#9ca3af' },
          }}
        />
        <Button
          variant="contained"
          color="primary"
          fullWidth
          onClick={handleLogin}
          disabled={loading}
          sx={{ py: 1.5, fontSize: '1rem' }}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : 'Login'}
        </Button>
      </Box>
    </Box>
  );
};

export default Login; 