import {
  Alert,
  Box,
  CircularProgress,
  Typography,
} from '@mui/material';
import {
  AnalyticsRounded,
  TrendingUpRounded,
  VerifiedUserOutlined,
} from '@mui/icons-material';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ThemeSwitcher from './ThemeSwitcher';

const DataPreview: React.FC = () => (
  <Box className="login-data-preview" aria-hidden="true">
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2.5 }}>
      <Box>
        <Typography sx={{ color: '#FFFFFF', fontWeight: 700, fontSize: '0.95rem' }}>
          Performance overview
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.62)', fontSize: '0.72rem' }}>
          Operational intelligence at a glance
        </Typography>
      </Box>
      <Box className="login-live-badge">
        <Box className="login-live-dot" />
        Live insights
      </Box>
    </Box>

    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.25, mb: 2.25 }}>
      {[
        { label: 'Revenue trend', value: '+12.8%' },
        { label: 'Bookings', value: '2.4k' },
        { label: 'Retention', value: '86%' },
      ].map((metric) => (
        <Box key={metric.label} className="login-metric-tile">
          <Typography sx={{ color: 'rgba(255,255,255,0.58)', fontSize: '0.62rem', mb: 0.45 }}>
            {metric.label}
          </Typography>
          <Typography sx={{ color: '#FFFFFF', fontWeight: 700, fontSize: '1rem', fontVariantNumeric: 'tabular-nums' }}>
            {metric.value}
          </Typography>
        </Box>
      ))}
    </Box>

    <Box className="login-chart-frame">
      <svg viewBox="0 0 520 165" preserveAspectRatio="none" focusable="false">
        <defs>
          <linearGradient id="loginChartArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#77D8C9" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#77D8C9" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[35, 75, 115, 155].map(y => (
          <line key={y} x1="0" y1={y} x2="520" y2={y} stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
        ))}
        <path
          className="login-data-area"
          d="M0,138 C35,128 58,133 87,110 C120,82 146,104 181,81 C220,55 250,75 284,48 C321,20 354,54 390,38 C430,20 464,32 520,8 L520,165 L0,165 Z"
          fill="url(#loginChartArea)"
        />
        <path
          className="login-data-line"
          d="M0,138 C35,128 58,133 87,110 C120,82 146,104 181,81 C220,55 250,75 284,48 C321,20 354,54 390,38 C430,20 464,32 520,8"
          fill="none"
          stroke="#77D8C9"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle className="login-chart-point" cx="284" cy="48" r="5" fill="#FFFFFF" />
        <circle className="login-chart-point login-chart-point--delay" cx="520" cy="8" r="5" fill="#FFFFFF" />
      </svg>
      <Box className="login-bar-row">
        {[48, 68, 42, 82, 60, 92, 72, 100, 78].map((height, index) => (
          <Box
            key={height + index}
            className="login-data-bar"
            sx={{ height: `${height}%`, animationDelay: `${index * 90}ms` }}
          />
        ))}
      </Box>
    </Box>
  </Box>
);

const Login: React.FC = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const googleButtonWrapperRef = useRef<HTMLDivElement | null>(null);
  const [googleButtonWidth, setGoogleButtonWidth] = useState(320);

  useEffect(() => {
    const wrapper = googleButtonWrapperRef.current;
    if (!wrapper) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = Math.floor(wrapper.getBoundingClientRect().width);
      if (nextWidth > 0) {
        setGoogleButtonWidth(Math.max(220, Math.min(400, nextWidth)));
      }
    };

    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(wrapper);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setError('Google sign-in was cancelled before a credential was returned.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await login(response.credential);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to log in.';
      setError(message);
      console.error('Google sign-in failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      className="login-shell"
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.14fr) minmax(440px, 0.86fr)' },
        bgcolor: 'var(--background)',
      }}
    >
      <Box
        className="login-brand-panel"
        sx={{
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: { xs: 250, md: '100dvh' },
          p: { xs: 3, sm: 5, lg: 7 },
          bgcolor: '#074142',
          color: '#FFFFFF',
        }}
      >
        <Box className="login-grid-pattern" />
        <Box className="login-orb login-orb--one" />
        <Box className="login-orb login-orb--two" />

        <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box className="login-brand-mark">
            <img src="/gtlogo.svg" alt="" width="100%" height="100%" />
          </Box>
          <Box>
            <Typography sx={{ color: '#FFFFFF', fontWeight: 750, fontSize: '1.12rem', lineHeight: 1.15 }}>
              GreatTime
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.58)', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Business Intelligence
            </Typography>
          </Box>
        </Box>

        <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 650, my: { xs: 4, md: 6 } }}>
          <Box className="login-eyebrow">
            <AnalyticsRounded sx={{ fontSize: 17 }} />
            Management intelligence workspace
          </Box>
          <Typography
            component="h1"
            sx={{
              color: '#FFFFFF',
              mt: 2,
              mb: 2,
              maxWidth: 610,
              fontSize: { xs: '2rem', sm: '2.75rem', lg: '3.4rem' },
              lineHeight: 1.08,
              letterSpacing: '-0.045em',
              fontWeight: 750,
            }}
          >
            Turn daily operations into clear decisions.
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.68)', maxWidth: 540, fontSize: { xs: '0.9rem', sm: '1rem' }, lineHeight: 1.75 }}>
            Monitor revenue, customers, services, and team performance from one secure management portal.
          </Typography>
        </Box>

        <Box sx={{ position: 'relative', zIndex: 1, display: { xs: 'none', sm: 'block' }, maxWidth: 650 }}>
          <DataPreview />
        </Box>
      </Box>

      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: { xs: 'auto', md: '100dvh' },
          px: { xs: 3, sm: 7, lg: 9 },
          py: { xs: 6, md: 8 },
          bgcolor: 'var(--background)',
        }}
      >
        <Box sx={{ position: 'absolute', top: { xs: 16, sm: 24 }, right: { xs: 16, sm: 24 } }}>
          <ThemeSwitcher />
        </Box>

        <Box sx={{ width: '100%', maxWidth: 440, mx: 'auto' }}>
          <Box sx={{ mb: 4.5 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.8,
                px: 1.25,
                py: 0.65,
                mb: 2.25,
                borderRadius: 999,
                color: 'var(--primary)',
                bgcolor: 'var(--primary-soft)',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              <TrendingUpRounded sx={{ fontSize: 16 }} />
              GreatTime BI Portal
            </Box>
            <Typography component="h2" sx={{ fontSize: { xs: '1.8rem', sm: '2.15rem' }, fontWeight: 750, letterSpacing: '-0.035em', color: 'var(--text-primary)', mb: 1 }}>
              Welcome back
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              Continue with a pre-approved Google email to access your organization’s live business insights.
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Box
            sx={{
              mb: 2.25,
              p: 2.25,
              borderRadius: 2,
              border: '1px solid var(--border)',
              bgcolor: 'var(--surface)',
            }}
          >
            <Typography sx={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 700, mb: 0.65 }}>
              Google sign-in only
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              Password login is no longer used. GreatTime verifies your Google email against the approved user list and clinic permissions.
            </Typography>
          </Box>

          <Box
            ref={googleButtonWrapperRef}
            sx={{
              minHeight: 44,
              display: 'flex',
              justifyContent: 'center',
              opacity: loading ? 0.55 : 1,
              pointerEvents: loading ? 'none' : 'auto',
            }}
          >
            <GoogleLogin
              onSuccess={(response) => void handleGoogleSuccess(response)}
              onError={() => setError('Google sign-in failed. Please try again.')}
              theme="outline"
              shape="pill"
              size="large"
              text="continue_with"
              width={String(googleButtonWidth)}
            />
          </Box>

          {loading && (
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'var(--text-secondary)' }}>
              <CircularProgress size={18} color="inherit" />
              <Typography variant="caption">Verifying your approved email and clinic access...</Typography>
            </Box>
          )}

          <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.8, color: 'var(--text-muted)' }}>
            <VerifiedUserOutlined sx={{ fontSize: 17 }} />
            <Typography variant="caption">Only pre-approved GreatTime accounts can continue</Typography>
          </Box>
        </Box>

        <Typography variant="caption" sx={{ position: { md: 'absolute' }, bottom: { md: 24 }, mt: { xs: 6, md: 0 }, alignSelf: 'center', color: 'var(--text-muted)' }}>
          GreatTime management intelligence workspace
        </Typography>
      </Box>
    </Box>
  );
};

export default Login;
