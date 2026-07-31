import { alpha, createTheme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';

export const lightPalette = {
  background: '#F6F8FC',
  surface: '#FFFFFF',
  surfaceSecondary: '#F0F3F9',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#162525',
  textSecondary: '#637272',
  textMuted: '#98A2B3',
  border: '#E4E7EC',
  borderStrong: '#D0D5DD',
  primary: '#074142',
  primaryHover: '#052F31',
  primaryMuted: '#5E958D',
  success: '#168260',
  warning: '#F59E0B',
  error: '#E5484D',
  chartGrid: '#E8ECF3',
};

export const darkPalette = {
  background: '#101C1C',
  surface: '#172626',
  surfaceSecondary: '#1E3130',
  surfaceElevated: '#243A39',
  textPrimary: '#F1F7F6',
  textSecondary: '#B5C7C4',
  textMuted: '#829A96',
  border: '#304A48',
  borderStrong: '#41615E',
  primary: '#5CC3B2',
  primaryHover: '#78D2C4',
  primaryMuted: '#459B8F',
  success: '#42B883',
  warning: '#F6B94A',
  error: '#FF6B70',
  chartGrid: '#2C3A55',
};

export const createAppTheme = (mode: PaletteMode) => {
  const colors = mode === 'light' ? lightPalette : darkPalette;

  return createTheme({
    palette: {
      mode,
      primary: {
        main: colors.primary,
        light: mode === 'light' ? '#2F766F' : '#78D2C4',
        dark: mode === 'light' ? '#052F31' : '#2F8F82',
        contrastText: '#FFFFFF',
      },
      secondary: {
        main: mode === 'light' ? '#A16C2F' : '#D4A866',
      },
      success: { main: colors.success },
      warning: { main: colors.warning },
      error: { main: colors.error },
      background: {
        default: colors.background,
        paper: colors.surface,
      },
      text: {
        primary: colors.textPrimary,
        secondary: colors.textSecondary,
      },
      divider: colors.border,
      action: {
        hover: alpha(colors.primary, mode === 'light' ? 0.06 : 0.12),
        selected: alpha(colors.primary, mode === 'light' ? 0.1 : 0.18),
        disabledBackground: mode === 'light' ? '#EAECF0' : '#293B3A',
      },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: "'Poppins', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: colors.background,
            color: colors.textPrimary,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            borderColor: colors.border,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: colors.surface,
            backgroundImage: 'none',
            color: colors.textPrimary,
            borderBottom: `1px solid ${colors.border}`,
            boxShadow: 'none',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: colors.surface,
            backgroundImage: 'none',
            borderColor: colors.border,
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 8,
            minHeight: 38,
            '&:focus-visible': {
              outline: `3px solid ${alpha(colors.primary, 0.28)}`,
              outlineOffset: 2,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: colors.surface,
            color: colors.textPrimary,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.borderStrong },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: colors.primary },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: colors.primary },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: { root: { color: colors.textSecondary } },
      },
      MuiSelect: {
        styleOverrides: { icon: { color: colors.textSecondary } },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            border: `1px solid ${colors.border}`,
            boxShadow: mode === 'light'
              ? '0 12px 32px rgba(16, 24, 40, 0.12)'
              : '0 12px 32px rgba(0, 0, 0, 0.28)',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottomColor: colors.border, color: colors.textPrimary },
          head: {
            backgroundColor: colors.surfaceSecondary,
            color: colors.textSecondary,
            fontWeight: 700,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: { '&:hover': { backgroundColor: alpha(colors.primary, 0.05) } },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { border: `1px solid ${colors.border}` },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: mode === 'light' ? '#162525' : '#F1F7F6',
            color: mode === 'light' ? '#FFFFFF' : '#162525',
            fontSize: '0.75rem',
          },
        },
      },
      MuiSkeleton: {
        styleOverrides: {
          root: { backgroundColor: colors.surfaceSecondary },
        },
      },
    },
  });
};
