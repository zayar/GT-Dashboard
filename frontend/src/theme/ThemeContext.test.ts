import { describe, expect, it } from 'vitest';
import { getInitialThemePreference, resolveThemeMode } from './ThemeContext';

describe('theme preference', () => {
  it('defaults new users to light mode', () => {
    expect(getInitialThemePreference(null)).toBe('light');
    expect(getInitialThemePreference('unsupported')).toBe('light');
  });

  it('restores a saved preference', () => {
    expect(getInitialThemePreference('dark')).toBe('dark');
    expect(getInitialThemePreference('system')).toBe('system');
  });

  it('resolves the optional system setting', () => {
    expect(resolveThemeMode('system', true)).toBe('dark');
    expect(resolveThemeMode('system', false)).toBe('light');
    expect(resolveThemeMode('light', true)).toBe('light');
  });
});
