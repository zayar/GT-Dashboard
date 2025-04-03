import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material'

// Create a dark theme with #101729 as the primary color
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#101729',
      light: '#2a3550',
      dark: '#080f1d',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#3b82f6',
      light: '#60a5fa',
      dark: '#2563eb',
    },
    background: {
      default: '#101729',
      paper: '#151f38',
    },
    text: {
      primary: '#f3f4f6',
      secondary: '#cbd5e1',
    },
    divider: 'rgba(148, 163, 184, 0.12)',
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#101729',
          backgroundImage: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#101729',
          backgroundImage: 'none',
        },
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
