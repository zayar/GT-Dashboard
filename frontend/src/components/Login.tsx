import React, { useState } from 'react';
import { Box, TextField, Button, Typography, CircularProgress, Alert } from '@mui/material';
import { auth } from '../config/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

interface LoginProps {
  onLogin: (status: boolean) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged in AuthProvider will handle setting currentUser
      onLogin(true); // Update App's state
    } catch (err: any) {
      setError(err.message || 'Failed to log in.');
      console.error("Firebase Login Error:", err);
      // Map Firebase error codes to user-friendly messages (optional but recommended)
      switch (err.code) {
        case 'auth/invalid-email':
          setError('Invalid email address format.');
          break;
        case 'auth/user-disabled':
          setError('This user account has been disabled.');
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          setError('Invalid email or password.');
          break;
        default:
          setError('Login failed. Please try again.');
      }
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