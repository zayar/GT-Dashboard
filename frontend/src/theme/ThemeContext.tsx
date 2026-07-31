import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import type { PaletteMode } from '@mui/material';
import { createAppTheme } from './theme';

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'gt-theme-preference';

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

export const getInitialThemePreference = (storedValue?: string | null): ThemePreference =>
  isThemePreference(storedValue ?? null) ? storedValue as ThemePreference : 'light';

export const resolveThemeMode = (
  preference: ThemePreference,
  systemPrefersDark: boolean,
): PaletteMode => preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedMode: PaletteMode;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeModeContext = createContext<ThemeContextValue | undefined>(undefined);

export const AppThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    getInitialThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY))
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const resolvedMode = resolveThemeMode(preference, systemPrefersDark);
  const theme = useMemo(() => createAppTheme(resolvedMode), [resolvedMode]);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    document.documentElement.dataset.theme = resolvedMode;
    document.documentElement.style.colorScheme = resolvedMode;
  }, [preference, resolvedMode]);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    resolvedMode,
    setPreference: setPreferenceState,
  }), [preference, resolvedMode]);

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
};

export const useAppTheme = (): ThemeContextValue => {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error('useAppTheme must be used inside AppThemeProvider');
  return context;
};
