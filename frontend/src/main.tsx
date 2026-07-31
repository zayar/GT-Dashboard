import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import {
  AppThemeProvider,
  getInitialThemePreference,
  resolveThemeMode,
  THEME_STORAGE_KEY,
} from './theme/ThemeContext'

const initialPreference = getInitialThemePreference(localStorage.getItem(THEME_STORAGE_KEY))
const initialMode = resolveThemeMode(
  initialPreference,
  window.matchMedia('(prefers-color-scheme: dark)').matches,
)
document.documentElement.dataset.theme = initialMode
document.documentElement.style.colorScheme = initialMode

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
if (!googleClientId) {
  throw new Error('Missing required environment variable: VITE_GOOGLE_CLIENT_ID')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppThemeProvider>
      <GoogleOAuthProvider clientId={googleClientId}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </GoogleOAuthProvider>
    </AppThemeProvider>
  </StrictMode>,
)
